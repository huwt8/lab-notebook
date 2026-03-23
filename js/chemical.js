/* ========================================================
   chemical.js - 药品管理模块
   ======================================================== */

const ChemicalModule = {
  editingId: null,

  /**
   * 初始化
   */
  init() {
    // 新增按钮
    document.getElementById('btnNewChem').addEventListener('click', () => this.openModal());

    // 搜索
    document.getElementById('chemSearch').addEventListener('input',
      Utils.debounce((e) => this.renderList(e.target.value), 200)
    );

    // 表单提交
    document.getElementById('chemForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.save();
    });

    // 关闭弹窗
    document.getElementById('chemModalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('chemCancelBtn').addEventListener('click', () => this.closeModal());

    // 点击遮罩关闭
    document.getElementById('chemModal').addEventListener('click', (e) => {
      if (e.target.id === 'chemModal') this.closeModal();
    });
  },

  /**
   * 渲染药品列表
   */
  async renderList(searchQuery = '') {
    const container = document.getElementById('chemList');
    let chemicals = await DB.getAllChemicals();

    // 搜索过滤
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      chemicals = chemicals.filter(c =>
        (c.nameZh && c.nameZh.toLowerCase().includes(q)) ||
        (c.nameEn && c.nameEn.toLowerCase().includes(q)) ||
        (c.cas && c.cas.includes(q)) ||
        (c.manufacturer && c.manufacturer.toLowerCase().includes(q))
      );
    }

    if (chemicals.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💊</div>
          <p>${searchQuery ? '未找到匹配的药品' : '暂无药品信息'}</p>
          <p class="empty-hint">${searchQuery ? '尝试其他关键词' : '点击"添加药品"录入药品'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = chemicals.map(c => `
      <div class="list-card" data-id="${c.id}">
        <div class="card-icon">💊</div>
        <div class="card-body">
          <div class="card-title">${this._escape(c.nameZh)}${c.nameEn ? ` <span style="color:var(--text-secondary);font-weight:400;font-size:0.88rem">(${this._escape(c.nameEn)})</span>` : ''}</div>
          <div class="card-subtitle">
            ${c.cas ? `CAS: ${this._escape(c.cas)} · ` : ''}MW: ${c.molecularWeight} g/mol${c.purity ? ` · 纯度: ${c.purity}%` : ''}
          </div>
          <div class="card-meta">
            ${c.manufacturer ? this._escape(c.manufacturer) : ''}${c.batchNo ? ` · 批次: ${this._escape(c.batchNo)}` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-outline" onclick="ChemicalModule.openModal('${c.id}');event.stopPropagation()">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="ChemicalModule.remove('${c.id}');event.stopPropagation()">删除</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * 打开弹窗（新增/编辑）
   */
  async openModal(id = null) {
    this.editingId = id;
    const form = document.getElementById('chemForm');
    const title = document.getElementById('chemModalTitle');

    form.reset();

    if (id) {
      title.textContent = '编辑药品';
      const chem = await DB.get(DB.STORES.chemicals, id);
      if (chem) {
        document.getElementById('chemNameZh').value = chem.nameZh || '';
        document.getElementById('chemNameEn').value = chem.nameEn || '';
        document.getElementById('chemCas').value = chem.cas || '';
        document.getElementById('chemMW').value = chem.molecularWeight || '';
        document.getElementById('chemDensity').value = chem.density || '';
        document.getElementById('chemPurity').value = chem.purity || 99;
        document.getElementById('chemManufacturer').value = chem.manufacturer || '';
        document.getElementById('chemBatch').value = chem.batchNo || '';
      }
    } else {
      title.textContent = '添加药品';
    }

    document.getElementById('chemModal').classList.add('show');
  },

  /**
   * 关闭弹窗
   */
  closeModal() {
    document.getElementById('chemModal').classList.remove('show');
    this.editingId = null;
  },

  /**
   * 保存药品
   */
  async save() {
    const data = {
      nameZh: document.getElementById('chemNameZh').value.trim(),
      nameEn: document.getElementById('chemNameEn').value.trim(),
      cas: document.getElementById('chemCas').value.trim(),
      molecularWeight: document.getElementById('chemMW').value,
      density: document.getElementById('chemDensity').value || null,
      purity: document.getElementById('chemPurity').value || 99,
      manufacturer: document.getElementById('chemManufacturer').value.trim(),
      batchNo: document.getElementById('chemBatch').value.trim()
    };

    if (!data.nameZh) {
      Utils.toast('请输入药品中文名称', 'warning');
      return;
    }
    if (!data.molecularWeight || parseFloat(data.molecularWeight) <= 0) {
      Utils.toast('请输入有效的分子量', 'warning');
      return;
    }

    try {
      if (this.editingId) {
        await DB.updateChemical(this.editingId, data);
        Utils.toast('药品已更新', 'success');
      } else {
        await DB.addChemical(data);
        Utils.toast('药品已添加', 'success');
      }
      this.closeModal();
      await this.renderList();
      WebDAV.notifyChange();
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  },

  /**
   * 删除药品
   */
  async remove(id) {
    if (!confirm('确定要删除这条药品记录吗？')) return;
    try {
      await DB.deleteChemical(id);
      Utils.toast('药品已删除', 'success');
      await this.renderList();
      WebDAV.notifyChange();
    } catch (err) {
      Utils.toast('删除失败: ' + err.message, 'error');
    }
  },

  /**
   * HTML 转义
   */
  _escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
