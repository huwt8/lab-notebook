/* ========================================================
   experiment.js - 实验记录模块（重构版）
   操作块 = 溶液配制 + 操作步骤，可多次循环
   含对照实验表格视图
   ======================================================== */

const ExperimentModule = {
  editingId: null,
  blockCount: 0,
  chemicalsCache: [],
  currentImages: [], // 用于存储当前实验的Base64图片数组

  init() {
    document.getElementById('btnBackExp').addEventListener('click', () => this.closeEditor());
    document.getElementById('btnSaveExp').addEventListener('click', () => this.save());
    document.getElementById('btnAddBlock').addEventListener('click', () => this.addBlock());
    
    // 初始化图片上传监听
    const uploadInput = document.getElementById('expImageUpload');
    if (uploadInput) {
      uploadInput.addEventListener('change', (e) => this.handleImageUpload(e));
    }
  },

  /* ============ 编辑器 ============ */

  async openEditor(id = null) {
    this.editingId = id;
    this.blockCount = 0;
    this.chemicalsCache = await DB.getAllChemicals();
    this.currentImages = [];
    document.getElementById('blocksContainer').innerHTML = '';
    document.getElementById('expImagePreviewContainer').innerHTML = '';
    const resetInput = document.getElementById('expImageUpload');
    if (resetInput) resetInput.value = '';

    // 隐藏列表，显示编辑器
    this._showPage('page-exp-edit');

    if (id) {
      document.getElementById('expEditTitle').textContent = '编辑实验';
      const exp = await DB.get(DB.STORES.experiments, id);
      if (exp) {
        document.getElementById('expNo').value = exp.expNo;
        document.getElementById('expDate').value = exp.date;
        document.getElementById('expTime').value = exp.time;
        document.getElementById('expTitle').value = exp.title;
        document.getElementById('expObservations').value = exp.observations || '';
        document.getElementById('expResults').value = exp.results || '';

        // 恢复图片
        if (exp.resultsImages && exp.resultsImages.length > 0) {
          this.currentImages = [...exp.resultsImages];
          this.renderImagePreviews();
        }

        // 恢复操作块
        if (exp.blocks && exp.blocks.length > 0) {
          for (const block of exp.blocks) {
            this.addBlock(block);
          }
        }
      }
    } else {
      document.getElementById('expEditTitle').textContent = '新建实验';
      const count = await DB.count(DB.STORES.experiments);
      document.getElementById('expNo').value = Utils.generateExpNo(count);
      document.getElementById('expDate').value = Utils.today();
      document.getElementById('expTime').value = Utils.nowTime();
      document.getElementById('expTitle').value = '';
      document.getElementById('expObservations').value = '';
      document.getElementById('expResults').value = '';
    }
  },

  closeEditor() {
    this._showPage('page-projects');
    this.editingId = null;
    // 恢复至实验列表
    if (ProjectModule.currentSubProjectId) {
      ProjectModule.showExperiments(ProjectModule.currentSubProjectId);
    }
  },

  /* ============ 操作块 ============ */

  addBlock(data = null) {
    this.blockCount++;
    const bIdx = this.blockCount;
    const container = document.getElementById('blocksContainer');

    const blockEl = document.createElement('div');
    blockEl.className = 'op-block';
    blockEl.id = `block-${bIdx}`;

    blockEl.innerHTML = `
      <div class="op-block-header">
        <span class="op-block-title">操作块 #${bIdx}</span>
        <button type="button" class="solution-remove" onclick="ExperimentModule.removeBlock(${bIdx})">✕</button>
      </div>

      <!-- 溶液配制区 -->
      <div class="op-section">
        <div class="section-header">
          <h4>🧪 溶液配制</h4>
          <button type="button" class="btn btn-sm btn-outline" onclick="ExperimentModule.addSolution(${bIdx})">＋ 添加溶液</button>
        </div>
        <div class="solutions-list" id="solList-${bIdx}"></div>
      </div>

      <!-- 操作步骤区 -->
      <div class="op-section">
        <div class="section-header">
          <h4>📝 操作步骤</h4>
          <button type="button" class="btn btn-sm btn-outline" onclick="ExperimentModule.addStep(${bIdx})">＋ 添加步骤</button>
        </div>
        <div class="steps-list" id="stepList-${bIdx}"></div>
      </div>
    `;

    container.appendChild(blockEl);

    // 恢复数据
    if (data) {
      if (data.solutions && data.solutions.length > 0) {
        for (const sol of data.solutions) {
          this.addSolution(bIdx, sol);
        }
      }
      if (data.steps && data.steps.length > 0) {
        for (const step of data.steps) {
          this.addStep(bIdx, step);
        }
      }
    }
  },

  removeBlock(bIdx) {
    const el = document.getElementById(`block-${bIdx}`);
    if (el) {
      el.style.animation = 'fadeIn 0.2s ease reverse';
      setTimeout(() => el.remove(), 200);
    }
  },

  /* ============ 溶液配制（块内） ============ */

  addSolution(bIdx, data = null) {
    const container = document.getElementById(`solList-${bIdx}`);
    if (!container) return;
    const sIdx = container.children.length + 1;
    const uid = `${bIdx}-${sIdx}-${Date.now()}`;

    const chemOptions = this.chemicalsCache.map(c =>
      `<option value="${c.id}" data-mw="${c.molecularWeight}" ${data && data.chemicalId === c.id ? 'selected' : ''}>
        ${this._esc(c.nameZh)}${c.nameEn ? ' (' + this._esc(c.nameEn) + ')' : ''} · MW: ${c.molecularWeight}
      </option>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'solution-card';
    card.id = `sol-${uid}`;
    card.innerHTML = `
      <div class="solution-header">
        <span class="solution-number">溶液 #${sIdx}</span>
        <button type="button" class="solution-remove" onclick="this.closest('.solution-card').remove()">✕</button>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label>溶液名称/用途</label>
        <input type="text" class="form-input sol-name" placeholder="例如：0.1M NaCl 水溶液、清洗液等" value="${data && data.name ? this._esc(data.name) : ''}">
      </div>
      <div class="form-group">
        <label>溶质 (选择主药品)</label>
        <select class="form-input sol-chemical" onchange="ExperimentModule.onChemSelect(this)">
          <option value="">-- 请选择溶质 --</option>
          ${chemOptions}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>分子量 (g/mol)</label>
          <input type="number" class="form-input sol-mw" readonly value="${data && data.mw ? data.mw : ''}">
        </div>
        <div class="form-group">
          <label>溶液体积 (mL)</label>
          <input type="number" class="form-input sol-vol" step="0.01" min="0" placeholder="如：100"
            value="${data && data.volumeML ? data.volumeML : ''}"
            oninput="ExperimentModule.recalcCard(this)">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>溶质质量 (g)</label>
          <input type="number" class="form-input sol-mass" step="0.00001" min="0" placeholder="输入质量"
            value="${data && data.massG ? data.massG : ''}"
            oninput="ExperimentModule.onMassIn(this)">
        </div>
        <div class="form-group">
          <label>摩尔量 (mol)</label>
          <input type="number" class="form-input sol-moles" step="0.00001" min="0" placeholder="输入摩尔量"
            value="${data && data.molesMol ? data.molesMol : ''}"
            oninput="ExperimentModule.onMolesIn(this)">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>质量浓度 (g/L)</label>
          <input type="number" class="form-input sol-conc-gl" step="0.00001" min="0" placeholder="如：10.5"
            value="${data && data.concGL ? data.concGL : ''}"
            oninput="ExperimentModule.onConcGLIn(this)">
        </div>
        <div class="form-group">
          <label>摩尔浓度 (mol/L)</label>
          <input type="number" class="form-input sol-conc-mol" step="0.00001" min="0" placeholder="如：0.1"
            value="${data && data.concMolL ? data.concMolL : ''}"
            oninput="ExperimentModule.onConcMolLIn(this)">
        </div>
      </div>
      
      <!-- 溶剂列表区 -->
      <div class="solvents-container" style="border-top: 1px dashed rgba(148, 163, 184, 0.2); margin-top: 16px; padding-top: 12px;">
        <div class="section-header" style="margin-bottom: 8px;">
          <h5 style="margin:0; font-size:13px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">💧 溶剂成分</h5>
          <button type="button" class="btn btn-sm btn-ghost" style="padding:4px 8px; font-size:12px;" onclick="ExperimentModule.addSolvent('${uid}')">＋ 添加溶剂</button>
        </div>
        <div class="solvents-list" id="solvents-${uid}"></div>
      </div>
    `;
    container.appendChild(card);

    // 恢复溶剂数据
    if (data && data.solvents && data.solvents.length > 0) {
      for (const solv of data.solvents) {
        this.addSolvent(uid, solv);
      }
    }

    // 自动填充分子量
    if (data && data.chemicalId) {
      const sel = card.querySelector('.sol-chemical');
      this.onChemSelect(sel);
    }
  },

  _fmt(val, digits = 5) {
    if (isNaN(val) || val === null || val === undefined) return '';
    return parseFloat(Number(val).toFixed(digits));
  },

  onChemSelect(sel) {
    const card = sel.closest('.solution-card');
    const mwInput = card.querySelector('.sol-mw');
    if (sel.selectedIndex > 0) {
      mwInput.value = sel.options[sel.selectedIndex].getAttribute('data-mw') || '';
    } else {
      mwInput.value = '';
    }
    this.recalcCard(sel);
  },

  onMassIn(el) {
    const card = el.closest('.solution-card');
    const massStr = card.querySelector('.sol-mass').value;
    const mw = parseFloat(card.querySelector('.sol-mw').value);
    const vol = parseFloat(card.querySelector('.sol-vol').value);

    if (massStr === '') return;
    const mass = parseFloat(massStr);

    if (mw > 0) card.querySelector('.sol-moles').value = this._fmt(mass / mw, 5);
    if (vol > 0) {
      card.querySelector('.sol-conc-gl').value = this._fmt(mass / (vol / 1000), 5);
      if (mw > 0) {
        card.querySelector('.sol-conc-mol').value = this._fmt((mass / mw) / (vol / 1000), 5);
      }
    }
  },

  onMolesIn(el) {
    const card = el.closest('.solution-card');
    const molesStr = card.querySelector('.sol-moles').value;
    const mw = parseFloat(card.querySelector('.sol-mw').value);
    const vol = parseFloat(card.querySelector('.sol-vol').value);

    if (molesStr === '') return;
    const moles = parseFloat(molesStr);

    if (mw > 0) card.querySelector('.sol-mass').value = this._fmt(moles * mw, 5);
    if (vol > 0) {
      if (mw > 0) card.querySelector('.sol-conc-gl').value = this._fmt((moles * mw) / (vol / 1000), 5);
      card.querySelector('.sol-conc-mol').value = this._fmt(moles / (vol / 1000), 5);
    }
  },

  onConcGLIn(el) {
    const card = el.closest('.solution-card');
    const concStr = card.querySelector('.sol-conc-gl').value;
    const mw = parseFloat(card.querySelector('.sol-mw').value);
    const vol = parseFloat(card.querySelector('.sol-vol').value);

    if (concStr === '') return;
    const conc = parseFloat(concStr);

    if (vol > 0) {
      const mass = conc * (vol / 1000);
      card.querySelector('.sol-mass').value = this._fmt(mass, 5);
      if (mw > 0) {
        card.querySelector('.sol-moles').value = this._fmt(mass / mw, 5);
        card.querySelector('.sol-conc-mol').value = this._fmt(conc / mw, 5);
      }
    } else if (mw > 0) {
      card.querySelector('.sol-conc-mol').value = this._fmt(conc / mw, 5);
    }
  },

  onConcMolLIn(el) {
    const card = el.closest('.solution-card');
    const concStr = card.querySelector('.sol-conc-mol').value;
    const mw = parseFloat(card.querySelector('.sol-mw').value);
    const vol = parseFloat(card.querySelector('.sol-vol').value);

    if (concStr === '') return;
    const conc = parseFloat(concStr);

    if (mw > 0) {
      card.querySelector('.sol-conc-gl').value = this._fmt(conc * mw, 5);
    }
    if (vol > 0) {
      const moles = conc * (vol / 1000);
      card.querySelector('.sol-moles').value = this._fmt(moles, 5);
      if (mw > 0) {
        card.querySelector('.sol-mass').value = this._fmt(moles * mw, 5);
      }
    }
  },

  recalcCard(el) {
    const card = el.closest('.solution-card');
    const massStr = card.querySelector('.sol-mass').value;
    const molesStr = card.querySelector('.sol-moles').value;
    const concGlStr = card.querySelector('.sol-conc-gl').value;
    const concMolStr = card.querySelector('.sol-conc-mol').value;
    
    // Default anchor is mass -> moles -> conc
    if (massStr !== '') {
       this.onMassIn(card.querySelector('.sol-mass'));
    } else if (molesStr !== '') {
       this.onMolesIn(card.querySelector('.sol-moles'));
    } else if (concGlStr !== '') {
       this.onConcGLIn(card.querySelector('.sol-conc-gl'));
    } else if (concMolStr !== '') {
       this.onConcMolLIn(card.querySelector('.sol-conc-mol'));
    }
  },

  /* ============ 多溶剂管理 ============ */
  addSolvent(uid, data = null) {
    const list = document.getElementById(`solvents-${uid}`);
    if (!list) return;

    const chemOptions = this.chemicalsCache.map(c =>
      `<option value="${c.id}" ${data && data.chemicalId === c.id ? 'selected' : ''}>
        ${this._esc(c.nameZh)}${c.nameEn ? ' (' + this._esc(c.nameEn) + ')' : ''}
      </option>`
    ).join('');

    const item = document.createElement('div');
    item.className = 'solvent-item';
    item.innerHTML = `
      <select class="form-input solvent-chemical" style="flex:2;">
        <option value="">-- 请选择溶剂 --</option>
        ${chemOptions}
      </select>
      <input type="number" class="form-input solvent-vol" step="0.01" min="0" placeholder="体积(mL)" value="${data && data.volumeML ? data.volumeML : ''}" style="flex:1;">
      <button type="button" class="btn btn-ghost solvent-remove" onclick="ExperimentModule.removeSolvent(this)" title="删除此溶剂">✕</button>
    `;
    list.appendChild(item);
  },

  removeSolvent(btn) {
    const item = btn.closest('.solvent-item');
    item.style.animation = 'fadeIn 0.2s ease reverse';
    setTimeout(() => item.remove(), 200);
  },

  /* ============ 操作步骤（块内） ============ */

  addStep(bIdx, content = '') {
    const container = document.getElementById(`stepList-${bIdx}`);
    if (!container) return;
    const sIdx = container.children.length + 1;

    const item = document.createElement('div');
    item.className = 'step-item';
    item.innerHTML = `
      <span class="step-number">${sIdx}</span>
      <textarea class="form-input step-content" rows="2" placeholder="描述操作步骤...">${this._esc(typeof content === 'string' ? content : '')}</textarea>
      <button type="button" class="step-remove" onclick="ExperimentModule.removeStep(this)">✕</button>
    `;
    container.appendChild(item);
  },

  removeStep(btn) {
    const item = btn.closest('.step-item');
    const container = item.parentElement;
    item.style.animation = 'fadeIn 0.2s ease reverse';
    setTimeout(() => {
      item.remove();
      // 重新编号
      container.querySelectorAll('.step-item').forEach((el, i) => {
        el.querySelector('.step-number').textContent = i + 1;
      });
    }, 200);
  },

  /* ============ 数据收集 ============ */

  _collectBlocks() {
    const blocks = [];
    document.querySelectorAll('.op-block').forEach(blockEl => {
      const solutions = [];
      blockEl.querySelectorAll('.solution-card').forEach(card => {
        const nameInput = card.querySelector('.sol-name');
        const name = nameInput ? nameInput.value.trim() : '';

        const sel = card.querySelector('.sol-chemical');
        const chemicalId = sel ? sel.value : '';
        const mw = parseFloat(card.querySelector('.sol-mw').value) || 0;
        const massG = parseFloat(card.querySelector('.sol-mass').value) || 0;
        const molesMol = parseFloat(card.querySelector('.sol-moles').value) || 0;
        const volumeML = parseFloat(card.querySelector('.sol-vol').value) || 0;
        const concGL = parseFloat(card.querySelector('.sol-conc-gl').value) || 0;
        const concMolL = parseFloat(card.querySelector('.sol-conc-mol').value) || 0;
        
        const solvents = [];
        card.querySelectorAll('.solvent-item').forEach(solvEl => {
          const sSel = solvEl.querySelector('.solvent-chemical');
          const sVol = parseFloat(solvEl.querySelector('.solvent-vol').value) || 0;
          if (sSel && sSel.value) {
            solvents.push({ chemicalId: sSel.value, volumeML: sVol });
          }
        });

        solutions.push({ name, chemicalId, mw, massG, molesMol, volumeML, concGL, concMolL, solvents });
      });

      const steps = [];
      blockEl.querySelectorAll('.step-content').forEach(ta => {
        if (ta.value.trim()) steps.push(ta.value.trim());
      });

      blocks.push({ solutions, steps });
    });
    return blocks;
  },

  /* ============ 保存 ============ */

  async save() {
    const data = {
      subProjectId: ProjectModule.currentSubProjectId || '',
      title: document.getElementById('expTitle').value.trim(),
      date: document.getElementById('expDate').value,
      time: document.getElementById('expTime').value,
      blocks: this._collectBlocks(),
      observations: document.getElementById('expObservations').value.trim(),
      results: document.getElementById('expResults').value.trim(),
      resultsImages: this.currentImages
    };

    if (!data.title) { Utils.toast('请输入实验标题', 'warning'); return; }

    try {
      if (this.editingId) {
        await DB.updateExperiment(this.editingId, data);
        Utils.toast('实验已更新', 'success');
      } else {
        data.expNo = document.getElementById('expNo').value;
        await DB.addExperiment(data);
        Utils.toast('实验已保存', 'success');
      }
      this.closeEditor();
      WebDAV.notifyChange();
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  },

  /* ============ 删除 ============ */

  async  remove(id) {
    if (!confirm('确定要删除这条实验记录吗？')) return;
    DB.deleteExperiment(id).then(() => {
      Utils.toast('实验已删除', 'success');
      if (ProjectModule.currentSubProjectId) {
        ProjectModule.renderExpList(ProjectModule.currentSubProjectId);
      }
      WebDAV.notifyChange();
    }).catch(err => {
      Utils.toast('删除失败: ' + err.message, 'error');
    });
  },

  /* ============ 图片操作 ============ */

  handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                // Resize if needed to prevent bloated DB
                const MAX_WIDTH = 1200;
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height = Math.round(height * (MAX_WIDTH / width));
                    width = MAX_WIDTH;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const base64Str = canvas.toDataURL('image/jpeg', 0.85);
                this.currentImages.push(base64Str);
                this.renderImagePreviews();
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
  },

  renderImagePreviews() {
    const container = document.getElementById('expImagePreviewContainer');
    if (!container) return;
    container.innerHTML = '';
    
    this.currentImages.forEach((base64, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-item';
        wrapper.innerHTML = `
            <img src="${base64}" alt="实验结果图">
            <button type="button" class="btn-remove-image" onclick="ExperimentModule.removeImage(${idx})">✕</button>
        `;
        container.appendChild(wrapper);
    });
  },

  removeImage(idx) {
    if (idx >= 0 && idx < this.currentImages.length) {
        this.currentImages.splice(idx, 1);
        this.renderImagePreviews();
    }
  },

  /* ============ 对照表格视图 ============ */

  async showCompareView() {
    if (!ProjectModule.currentSubProjectId) return;

    const experiments = await DB.getExperimentsBySubProject(ProjectModule.currentSubProjectId);
    const chemicals = await DB.getAllChemicals();
    const chemMap = {};
    chemicals.forEach(c => chemMap[c.id] = c);

    if (experiments.length < 1) {
      Utils.toast('需要至少1个实验才能生成对照表格', 'warning');
      return;
    }

    this._showPage('page-compare');

    const wrapper = document.getElementById('compareTableWrapper');

    // 构建表格数据
    // 行：各项参数；列：各实验
    const rows = [];

    // 基本信息行
    rows.push({ label: '实验编号', values: experiments.map(e => e.expNo) });
    rows.push({ label: '实验标题', values: experiments.map(e => e.title) });
    rows.push({ label: '日期', values: experiments.map(e => `${e.date} ${e.time || ''}`) });

    // 收集所有操作块的溶液信息
    const maxBlocks = Math.max(...experiments.map(e => (e.blocks || []).length));
    for (let bi = 0; bi < maxBlocks; bi++) {
      rows.push({ label: `━ 操作块 ${bi + 1} ━`, values: experiments.map(() => ''), isHeader: true });

      // 该块每个实验的溶液
      const maxSols = Math.max(...experiments.map(e => {
        const b = (e.blocks || [])[bi];
        return b ? (b.solutions || []).length : 0;
      }));

      for (let si = 0; si < maxSols; si++) {
        rows.push({
          label: `溶液${si + 1} - 名称`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            return sol && sol.name ? sol.name : '—';
          })
        });
        rows.push({
          label: `溶液${si + 1} - 溶质`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            if (!sol || !sol.chemicalId) return '—';
            const c = chemMap[sol.chemicalId];
            return c ? c.nameZh : '—';
          })
        });
        rows.push({
          label: `溶液${si + 1} - 溶剂配方`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            if (!sol || !sol.solvents || sol.solvents.length === 0) return '—';
            return sol.solvents.map(s => {
              const c = chemMap[s.chemicalId];
              const cname = c ? c.nameZh : '未知';
              return s.volumeML ? `${cname} ${s.volumeML}mL` : cname;
            }).join(' + ');
          })
        });
        rows.push({
          label: `溶液${si + 1} - 质量(g)`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            return sol && sol.massG ? Utils.formatNum(sol.massG) : '—';
          })
        });
        rows.push({
          label: `溶液${si + 1} - 体积(mL)`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            return sol && sol.volumeML ? Utils.formatNum(sol.volumeML) : '—';
          })
        });
        rows.push({
          label: `溶液${si + 1} - 质量浓度(g/L)`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            return sol && sol.concGL ? Utils.formatNum(sol.concGL) : '—';
          }),
          isCalc: true
        });
        rows.push({
          label: `溶液${si + 1} - 摩尔浓度(mol/L)`,
          values: experiments.map(e => {
            const sol = ((e.blocks || [])[bi]?.solutions || [])[si];
            return sol && sol.concMolL ? Utils.formatNum(sol.concMolL) : '—';
          }),
          isCalc: true
        });
      }

      // 步骤
      const maxSteps = Math.max(...experiments.map(e => {
        const b = (e.blocks || [])[bi];
        return b ? (b.steps || []).length : 0;
      }));
      for (let sti = 0; sti < maxSteps; sti++) {
        rows.push({
          label: `步骤 ${sti + 1}`,
          values: experiments.map(e => {
            const st = ((e.blocks || [])[bi]?.steps || [])[sti];
            return st || '—';
          })
        });
      }
    }

    // 现象和结果
    rows.push({ label: '━ 实验结果 ━', values: experiments.map(() => ''), isHeader: true });
    rows.push({ label: '实验现象', values: experiments.map(e => e.observations || '—') });
    rows.push({ label: '实验结果', values: experiments.map(e => e.results || '—') });

    // 渲染表格
    let html = '<div class="compare-scroll"><table class="compare-table"><thead><tr>';
    html += '<th class="compare-label-col">对比项</th>';
    experiments.forEach(e => {
      html += `<th>${this._esc(e.title || e.expNo)}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
      const cls = row.isHeader ? 'compare-section-row' : (row.isCalc ? 'compare-calc-row' : '');
      html += `<tr class="${cls}">`;
      html += `<td class="compare-label">${this._esc(row.label)}</td>`;
      row.values.forEach(v => {
        html += `<td>${this._esc(v)}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    wrapper.innerHTML = html;
  },

  /* ============ 辅助 ============ */

  _showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.removeAttribute('data-active'));
    document.getElementById(pageId).setAttribute('data-active', 'true');
  },

  _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
