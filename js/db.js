/* ========================================================
   db.js - IndexedDB 数据库 v2
   新增 projects / subprojects 表，实验增加层级关联和操作块
   ======================================================== */

const DB = {
  db: null,
  DB_NAME: 'LabNotebook',
  DB_VERSION: 2,
  STORES: {
    chemicals: 'chemicals',
    projects: 'projects',
    subprojects: 'subprojects',
    experiments: 'experiments',
    settings: 'settings'
  },

  /**
   * 初始化数据库
   */
  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // 药品表
        if (!db.objectStoreNames.contains(this.STORES.chemicals)) {
          const chemStore = db.createObjectStore(this.STORES.chemicals, { keyPath: 'id' });
          chemStore.createIndex('nameZh', 'nameZh', { unique: false });
          chemStore.createIndex('nameEn', 'nameEn', { unique: false });
          chemStore.createIndex('cas', 'cas', { unique: false });
          chemStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 主项目表
        if (!db.objectStoreNames.contains(this.STORES.projects)) {
          const projStore = db.createObjectStore(this.STORES.projects, { keyPath: 'id' });
          projStore.createIndex('name', 'name', { unique: false });
          projStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 子项目表
        if (!db.objectStoreNames.contains(this.STORES.subprojects)) {
          const subStore = db.createObjectStore(this.STORES.subprojects, { keyPath: 'id' });
          subStore.createIndex('projectId', 'projectId', { unique: false });
          subStore.createIndex('name', 'name', { unique: false });
          subStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 实验记录表
        if (!db.objectStoreNames.contains(this.STORES.experiments)) {
          const expStore = db.createObjectStore(this.STORES.experiments, { keyPath: 'id' });
          expStore.createIndex('expNo', 'expNo', { unique: false });
          expStore.createIndex('date', 'date', { unique: false });
          expStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          expStore.createIndex('subProjectId', 'subProjectId', { unique: false });
        } else {
          // 升级已有表：添加 subProjectId 索引
          const tx = e.target.transaction;
          const expStore = tx.objectStore(this.STORES.experiments);
          if (!expStore.indexNames.contains('subProjectId')) {
            expStore.createIndex('subProjectId', 'subProjectId', { unique: false });
          }
        }

        // 设置表
        if (!db.objectStoreNames.contains(this.STORES.settings)) {
          db.createObjectStore(this.STORES.settings, { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  },

  /* ============ 通用 CRUD ============ */

  put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  count(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  /* ============ 药品相关 ============ */

  async addChemical(data) {
    const now = Utils.isoNow();
    const chemical = {
      id: Utils.uuid(),
      nameZh: data.nameZh || '',
      nameEn: data.nameEn || '',
      cas: data.cas || '',
      manufacturer: data.manufacturer || '',
      batchNo: data.batchNo || '',
      molecularWeight: parseFloat(data.molecularWeight) || 0,
      density: data.density ? parseFloat(data.density) : null,
      purity: parseFloat(data.purity) || 99,
      createdAt: now,
      updatedAt: now
    };
    return this.put(this.STORES.chemicals, chemical);
  },

  async updateChemical(id, data) {
    const existing = await this.get(this.STORES.chemicals, id);
    if (!existing) throw new Error('药品不存在');
    const updated = {
      ...existing,
      ...data,
      molecularWeight: parseFloat(data.molecularWeight) || existing.molecularWeight,
      density: data.density ? parseFloat(data.density) : null,
      purity: parseFloat(data.purity) || existing.purity,
      updatedAt: Utils.isoNow()
    };
    return this.put(this.STORES.chemicals, updated);
  },

  async getAllChemicals() {
    const chemicals = await this.getAll(this.STORES.chemicals);
    return chemicals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async deleteChemical(id) {
    return this.delete(this.STORES.chemicals, id);
  },

  /* ============ 主项目相关 ============ */

  async addProject(data) {
    const now = Utils.isoNow();
    const project = {
      id: Utils.uuid(),
      name: data.name || '',
      description: data.description || '',
      createdAt: now,
      updatedAt: now
    };
    return this.put(this.STORES.projects, project);
  },

  async updateProject(id, data) {
    const existing = await this.get(this.STORES.projects, id);
    if (!existing) throw new Error('项目不存在');
    const updated = { ...existing, ...data, updatedAt: Utils.isoNow() };
    return this.put(this.STORES.projects, updated);
  },

  async getAllProjects() {
    const projects = await this.getAll(this.STORES.projects);
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async deleteProject(id) {
    // 级联删除子项目和实验
    const subs = await this.getSubProjectsByProject(id);
    for (const sub of subs) {
      await this.deleteSubProject(sub.id);
    }
    return this.delete(this.STORES.projects, id);
  },

  /* ============ 子项目相关 ============ */

  async addSubProject(data) {
    const now = Utils.isoNow();
    const sub = {
      id: Utils.uuid(),
      projectId: data.projectId,
      name: data.name || '',
      description: data.description || '',
      createdAt: now,
      updatedAt: now
    };
    return this.put(this.STORES.subprojects, sub);
  },

  async updateSubProject(id, data) {
    const existing = await this.get(this.STORES.subprojects, id);
    if (!existing) throw new Error('子项目不存在');
    const updated = { ...existing, ...data, updatedAt: Utils.isoNow() };
    return this.put(this.STORES.subprojects, updated);
  },

  async getSubProjectsByProject(projectId) {
    const all = await this.getAll(this.STORES.subprojects);
    return all.filter(s => s.projectId === projectId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async deleteSubProject(id) {
    // 级联删除实验
    const exps = await this.getExperimentsBySubProject(id);
    for (const exp of exps) {
      await this.delete(this.STORES.experiments, exp.id);
    }
    return this.delete(this.STORES.subprojects, id);
  },

  /* ============ 实验相关 ============ */

  async addExperiment(data) {
    const now = Utils.isoNow();
    const count = await this.count(this.STORES.experiments);
    const experiment = {
      id: Utils.uuid(),
      subProjectId: data.subProjectId || '',
      expNo: data.expNo || Utils.generateExpNo(count),
      title: data.title || '',
      date: data.date || Utils.today(),
      time: data.time || Utils.nowTime(),
      // 操作块数组：[{ solutions: [...], steps: [...] }, ...]
      blocks: data.blocks || [],
      observations: data.observations || '',
      results: data.results || '',
      createdAt: now,
      updatedAt: now
    };
    return this.put(this.STORES.experiments, experiment);
  },

  async updateExperiment(id, data) {
    const existing = await this.get(this.STORES.experiments, id);
    if (!existing) throw new Error('实验记录不存在');
    const updated = { ...existing, ...data, updatedAt: Utils.isoNow() };
    return this.put(this.STORES.experiments, updated);
  },

  async getExperimentsBySubProject(subProjectId) {
    const all = await this.getAll(this.STORES.experiments);
    return all.filter(e => e.subProjectId === subProjectId)
              .sort((a, b) => {
                const d = b.date.localeCompare(a.date);
                return d !== 0 ? d : b.time.localeCompare(a.time);
              });
  },

  async getAllExperiments() {
    const experiments = await this.getAll(this.STORES.experiments);
    return experiments.sort((a, b) => {
      const dateComp = b.date.localeCompare(a.date);
      return dateComp !== 0 ? dateComp : b.time.localeCompare(a.time);
    });
  },

  async deleteExperiment(id) {
    return this.delete(this.STORES.experiments, id);
  },

  /* ============ 设置相关 ============ */

  async saveSetting(key, value) {
    return this.put(this.STORES.settings, { key, value, updatedAt: Utils.isoNow() });
  },

  async getSetting(key) {
    const result = await this.get(this.STORES.settings, key);
    return result ? result.value : null;
  },

  /**
   * 导出所有数据为 JSON
   */
  async exportAll() {
    const chemicals = await this.getAll(this.STORES.chemicals);
    const projects = await this.getAll(this.STORES.projects);
    const subprojects = await this.getAll(this.STORES.subprojects);
    const experiments = await this.getAll(this.STORES.experiments);
    return {
      version: 2,
      exportedAt: Utils.isoNow(),
      chemicals,
      projects,
      subprojects,
      experiments
    };
  },

  /**
   * 从 JSON 导入数据（合并策略：以最新 updatedAt 为准）
   */
  async importAll(jsonData) {
    if (!jsonData) throw new Error('无效的数据格式');

    let imported = { chemicals: 0, projects: 0, subprojects: 0, experiments: 0 };

    const mergeStore = async (storeName, items, key) => {
      if (!items) return;
      for (const item of items) {
        const existing = await this.get(storeName, item.id);
        if (!existing || item.updatedAt > existing.updatedAt) {
          await this.put(storeName, item);
          imported[key]++;
        }
      }
    };

    await mergeStore(this.STORES.chemicals, jsonData.chemicals, 'chemicals');
    await mergeStore(this.STORES.projects, jsonData.projects, 'projects');
    await mergeStore(this.STORES.subprojects, jsonData.subprojects, 'subprojects');
    await mergeStore(this.STORES.experiments, jsonData.experiments, 'experiments');

    return imported;
  }
};
