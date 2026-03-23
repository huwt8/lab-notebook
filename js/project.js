/* ========================================================
   project.js - 项目管理模块 (主项目 + 子项目)
   ======================================================== */

const ProjectModule = {
  editingProjectId: null,
  editingSubId: null,
  currentProjectId: null,
  currentSubProjectId: null,

  init() {
    // 新建项目
    document.getElementById('btnNewProject').addEventListener('click', () => this.openProjectModal());
    // 项目弹窗
    document.getElementById('projForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveProject(); });
    document.getElementById('projModalClose').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('projCancelBtn').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('projModal').addEventListener('click', (e) => { if (e.target.id === 'projModal') this.closeProjectModal(); });

    // 子项目弹窗
    document.getElementById('subForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveSubProject(); });
    document.getElementById('subModalClose').addEventListener('click', () => this.closeSubModal());
    document.getElementById('subCancelBtn').addEventListener('click', () => this.closeSubModal());
    document.getElementById('subModal').addEventListener('click', (e) => { if (e.target.id === 'subModal') this.closeSubModal(); });

    // 复制实验弹窗
    const copyForm = document.getElementById('copyExpForm');
    if (copyForm) {
      copyForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitCopyExp(); });
      document.getElementById('copyExpModalClose').addEventListener('click', () => this.closeCopyModal());
      document.getElementById('copyExpCancelBtn').addEventListener('click', () => this.closeCopyModal());
      document.getElementById('copyTargetProject').addEventListener('change', (e) => this.onCopyProjectChange(e.target.value));
    }

    // 返回按钮
    document.getElementById('btnBackToProjects').addEventListener('click', () => this.showProjectList());
    document.getElementById('btnBackToSubs').addEventListener('click', () => this.showSubProjects(this.currentProjectId));
  },

  /* ============ 主项目列表 ============ */

  async renderProjectList() {
    const container = document.getElementById('projectList');
    const projects = await DB.getAllProjects();

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📁</div>
          <p>暂无项目</p>
          <p class="empty-hint">点击"新建项目"创建研究项目</p>
        </div>`;
      return;
    }

    let html = '';
    for (const proj of projects) {
      const subs = await DB.getSubProjectsByProject(proj.id);
      const expCount = await this._countExpsInProject(proj.id);
      html += `
        <div class="list-card" onclick="ProjectModule.showSubProjects('${proj.id}')">
          <div class="card-icon">📁</div>
          <div class="card-body">
            <div class="card-title">${this._esc(proj.name)}</div>
            <div class="card-subtitle">${this._esc(proj.description)}</div>
            <div class="card-meta">${subs.length} 个子项目 · ${expCount} 个实验</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-outline" onclick="ProjectModule.openProjectModal('${proj.id}');event.stopPropagation()">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="ProjectModule.removeProject('${proj.id}');event.stopPropagation()">删除</button>
          </div>
        </div>`;
    }
    container.innerHTML = html;
  },

  async _countExpsInProject(projectId) {
    const subs = await DB.getSubProjectsByProject(projectId);
    let count = 0;
    for (const s of subs) {
      const exps = await DB.getExperimentsBySubProject(s.id);
      count += exps.length;
    }
    return count;
  },

  showProjectList() {
    this.currentProjectId = null;
    this.currentSubProjectId = null;
    document.getElementById('projectListView').style.display = 'block';
    document.getElementById('subProjectView').style.display = 'none';
    document.getElementById('expListView').style.display = 'none';
    document.getElementById('page-exp-edit').removeAttribute('data-active');
    document.getElementById('page-compare').removeAttribute('data-active');
    this._updateBreadcrumb([{ label: '全部项目' }]);
    this.renderProjectList();
  },

  /* ============ 子项目列表 ============ */

  async showSubProjects(projectId) {
    this.currentProjectId = projectId;
    this.currentSubProjectId = null;
    const proj = await DB.get(DB.STORES.projects, projectId);

    document.getElementById('projectListView').style.display = 'none';
    document.getElementById('subProjectView').style.display = 'block';
    document.getElementById('expListView').style.display = 'none';
    document.getElementById('subProjectTitle').textContent = proj ? proj.name : '子项目';

    this._updateBreadcrumb([
      { label: '全部项目', onclick: 'ProjectModule.showProjectList()' },
      { label: proj ? proj.name : '项目' }
    ]);

    await this.renderSubList(projectId);
  },

  async renderSubList(projectId) {
    const container = document.getElementById('subProjectList');
    const subs = await DB.getSubProjectsByProject(projectId);

    if (subs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>暂无子项目</p>
          <p class="empty-hint">点击"新建子项目"开始</p>
        </div>`;
      return;
    }

    let html = '';
    for (const sub of subs) {
      const exps = await DB.getExperimentsBySubProject(sub.id);
      html += `
        <div class="list-card" onclick="ProjectModule.showExperiments('${sub.id}')">
          <div class="card-icon">📂</div>
          <div class="card-body">
            <div class="card-title">${this._esc(sub.name)}</div>
            <div class="card-subtitle">${this._esc(sub.description)}</div>
            <div class="card-meta">${exps.length} 个实验</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-outline" onclick="ProjectModule.openSubModal('${sub.id}');event.stopPropagation()">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="ProjectModule.removeSubProject('${sub.id}');event.stopPropagation()">删除</button>
          </div>
        </div>`;
    }
    container.innerHTML = html;
  },

  /* ============ 实验列表（在子项目下） ============ */

  async showExperiments(subProjectId) {
    this.currentSubProjectId = subProjectId;
    const sub = await DB.get(DB.STORES.subprojects, subProjectId);
    const proj = sub ? await DB.get(DB.STORES.projects, sub.projectId) : null;
    this.currentProjectId = sub ? sub.projectId : this.currentProjectId;

    document.getElementById('projectListView').style.display = 'none';
    document.getElementById('subProjectView').style.display = 'none';
    document.getElementById('expListView').style.display = 'block';
    document.getElementById('expListTitle').textContent = sub ? sub.name + ' - 实验列表' : '实验列表';

    this._updateBreadcrumb([
      { label: '全部项目', onclick: 'ProjectModule.showProjectList()' },
      { label: proj ? proj.name : '项目', onclick: `ProjectModule.showSubProjects('${this.currentProjectId}')` },
      { label: sub ? sub.name : '子项目' }
    ]);

    await this.renderExpList(subProjectId);
  },

  async renderExpList(subProjectId) {
    const container = document.getElementById('expList');
    const experiments = await DB.getExperimentsBySubProject(subProjectId);
    const chemicals = await DB.getAllChemicals();
    const chemMap = {};
    chemicals.forEach(c => chemMap[c.id] = c);

    if (experiments.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <p>暂无实验记录</p>
          <p class="empty-hint">点击"新建实验"开始记录</p>
        </div>`;
      return;
    }

    container.innerHTML = experiments.map(exp => {
      const blockCount = (exp.blocks || []).length;
      const solNames = (exp.blocks || []).flatMap(b =>
        (b.solutions || []).map(s => {
          const c = chemMap[s.chemicalId];
          return c ? c.nameZh : '';
        }).filter(Boolean)
      );
      const uniqueSols = [...new Set(solNames)].join(', ');
      return `
        <div class="list-card" onclick="ExperimentModule.openEditor('${exp.id}')">
          <div class="card-icon">🧪</div>
          <div class="card-body">
            <div class="card-title">${this._esc(exp.title) || '无标题'}</div>
            <div class="card-subtitle">${exp.expNo} · ${exp.date} ${exp.time || ''}</div>
            <div class="card-meta">
              ${blockCount} 个操作块${uniqueSols ? ' · 药品: ' + this._esc(uniqueSols) : ''}
            </div>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-outline" onclick="ProjectModule.openCopyModal('${exp.id}');event.stopPropagation()">复制</button>
            <button class="btn btn-sm btn-danger" onclick="ExperimentModule.remove('${exp.id}');event.stopPropagation()">删除</button>
          </div>
        </div>`;
    }).join('');
  },

  /* ============ 项目弹窗 ============ */

  async openProjectModal(id = null) {
    this.editingProjectId = id;
    const form = document.getElementById('projForm');
    form.reset();
    document.getElementById('projModalTitle').textContent = id ? '编辑项目' : '新建项目';
    if (id) {
      const p = await DB.get(DB.STORES.projects, id);
      if (p) {
        document.getElementById('projName').value = p.name;
        document.getElementById('projDesc').value = p.description || '';
      }
    }
    document.getElementById('projModal').classList.add('show');
  },

  closeProjectModal() {
    document.getElementById('projModal').classList.remove('show');
    this.editingProjectId = null;
  },

  async saveProject() {
    const name = document.getElementById('projName').value.trim();
    if (!name) { Utils.toast('请输入项目名称', 'warning'); return; }
    const data = { name, description: document.getElementById('projDesc').value.trim() };
    try {
      if (this.editingProjectId) {
        await DB.updateProject(this.editingProjectId, data);
        Utils.toast('项目已更新', 'success');
      } else {
        await DB.addProject(data);
        Utils.toast('项目已创建', 'success');
      }
      this.closeProjectModal();
      await this.renderProjectList();
      WebDAV.notifyChange();
    } catch (e) { Utils.toast('保存失败: ' + e.message, 'error'); }
  },

  async removeProject(id) {
    if (!confirm('确定要删除此项目及其所有子项目和实验吗？')) return;
    try {
      await DB.deleteProject(id);
      Utils.toast('项目已删除', 'success');
      await this.renderProjectList();
      WebDAV.notifyChange();
    } catch (e) { Utils.toast('删除失败: ' + e.message, 'error'); }
  },

  /* ============ 子项目弹窗 ============ */

  async openSubModal(id = null) {
    this.editingSubId = id;
    const form = document.getElementById('subForm');
    form.reset();
    document.getElementById('subModalTitle').textContent = id ? '编辑子项目' : '新建子项目';
    if (id) {
      const s = await DB.get(DB.STORES.subprojects, id);
      if (s) {
        document.getElementById('subName').value = s.name;
        document.getElementById('subDesc').value = s.description || '';
      }
    }
    document.getElementById('subModal').classList.add('show');
  },

  closeSubModal() {
    document.getElementById('subModal').classList.remove('show');
    this.editingSubId = null;
  },

  async saveSubProject() {
    const name = document.getElementById('subName').value.trim();
    if (!name) { Utils.toast('请输入子项目名称', 'warning'); return; }
    const data = { name, description: document.getElementById('subDesc').value.trim() };
    try {
      if (this.editingSubId) {
        await DB.updateSubProject(this.editingSubId, data);
        Utils.toast('子项目已更新', 'success');
      } else {
        data.projectId = this.currentProjectId;
        await DB.addSubProject(data);
        Utils.toast('子项目已创建', 'success');
      }
      this.closeSubModal();
      await this.renderSubList(this.currentProjectId);
      WebDAV.notifyChange();
    } catch (e) { Utils.toast('保存失败: ' + e.message, 'error'); }
  },

  async removeSubProject(id) {
    if (!confirm('确定要删除此子项目及其所有实验吗？')) return;
    try {
      await DB.deleteSubProject(id);
      Utils.toast('子项目已删除', 'success');
      await this.renderSubList(this.currentProjectId);
      WebDAV.notifyChange();
    } catch (e) { Utils.toast('删除失败: ' + e.message, 'error'); }
  },

  /* ============ 复制实验弹窗 ============ */

  copyExpId: null,

  async openCopyModal(expId) {
    this.copyExpId = expId;
    const form = document.getElementById('copyExpForm');
    form.reset();

    const projSelect = document.getElementById('copyTargetProject');
    const subSelect = document.getElementById('copyTargetSub');
    projSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    subSelect.innerHTML = '<option value="">-- 请选择 --</option>';

    const projects = await DB.getAllProjects();
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      projSelect.appendChild(opt);
    });

    document.getElementById('copyExpModal').classList.add('show');
  },

  closeCopyModal() {
    document.getElementById('copyExpModal').classList.remove('show');
    this.copyExpId = null;
  },

  async onCopyProjectChange(projectId) {
    const subSelect = document.getElementById('copyTargetSub');
    subSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    if (!projectId) return;

    const subs = await DB.getSubProjectsByProject(projectId);
    subs.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      subSelect.appendChild(opt);
    });
  },

  async submitCopyExp() {
    if (!this.copyExpId) return;
    const subId = document.getElementById('copyTargetSub').value;
    if (!subId) {
      Utils.toast('请选择目标子项目', 'warning');
      return;
    }

    try {
      const original = await DB.get(DB.STORES.experiments, this.copyExpId);
      if (!original) throw new Error('实验记录不存在');

      const count = await DB.count(DB.STORES.experiments);
      const cloned = JSON.parse(JSON.stringify(original));
      delete cloned.id;
      
      cloned.subProjectId = subId;
      cloned.expNo = Utils.generateExpNo(count);
      cloned.title = (cloned.title || '无标题') + ' - 副本';
      cloned.date = Utils.today();
      cloned.time = Utils.nowTime();
      
      await DB.addExperiment(cloned);
      
      Utils.toast('实验已成功复制', 'success');
      this.closeCopyModal();
      
      if (this.currentSubProjectId) {
        await this.renderExpList(this.currentSubProjectId);
      }
      WebDAV.notifyChange();
    } catch (e) {
      Utils.toast('复制失败: ' + e.message, 'error');
    }
  },

  /* ============ 面包屑导航 ============ */

  _updateBreadcrumb(items) {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;
    bc.innerHTML = items.map((item, i) => {
      const isLast = i === items.length - 1;
      if (isLast) {
        return `<span class="bc-current">${this._esc(item.label)}</span>`;
      }
      return `<a class="bc-link" href="javascript:void(0)" onclick="${item.onclick}">${this._esc(item.label)}</a>
              <span class="bc-sep">›</span>`;
    }).join('');
  },

  _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
