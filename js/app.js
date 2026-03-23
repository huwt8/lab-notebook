/* ========================================================
   app.js - 主应用入口（重构版）
   ======================================================== */

const App = {
  currentPage: 'projects',

  async init() {
    try {
      await DB.init();
      console.log('✓ 数据库 v2 初始化完成');

      // 初始化模块
      ChemicalModule.init();
      ProjectModule.init();
      ExperimentModule.init();

      this.initNavigation();
      this.initSidebar();
      this.initSettings();
      this.initSync();

      await WebDAV.loadConfig();
      if (WebDAV.config) {
        WebDAV._updateStatus('online');
        setTimeout(() => WebDAV.sync().catch(() => {}), 1000);
      }

      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());

      this.registerSW();
      console.log('✓ 应用初始化完成');
    } catch (err) {
      console.error('应用初始化失败:', err);
      Utils.toast('应用初始化失败: ' + err.message, 'error');
    }
  },

  initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        window.location.hash = page;
        this.closeSidebar();
      });
    });
  },

  handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'projects';
    this.navigateTo(hash);
  },

  async navigateTo(pageName) {
    this.currentPage = pageName;

    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.removeAttribute('data-active'));

    // 导航高亮
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (activeNav) activeNav.classList.add('active');

    const titles = {
      projects: '项目管理',
      chemicals: '药品管理',
      settings: '同步设置'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || pageName;

    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
      targetPage.setAttribute('data-active', 'true');
    }

    switch (pageName) {
      case 'projects':
        ProjectModule.showProjectList();
        break;
      case 'chemicals':
        await ChemicalModule.renderList();
        break;
      case 'settings':
        await this.loadSettings();
        break;
    }
  },

  /* ============ 侧边栏 ============ */

  initSidebar() {
    document.getElementById('menuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebarOverlay').classList.add('show');
    });
    document.getElementById('sidebarClose').addEventListener('click', () => this.closeSidebar());
    document.getElementById('sidebarOverlay').addEventListener('click', () => this.closeSidebar());
  },

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  },

  /* ============ 设置 ============ */

  initSettings() {
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });
    document.getElementById('btnTestDav').addEventListener('click', () => this.testConnection());

    const btnExport = document.getElementById('btnExportBackup');
    const btnImport = document.getElementById('btnImportBackup');
    const inputImport = document.getElementById('importDataInput');

    if (btnExport) btnExport.addEventListener('click', () => this.exportBackup());
    if (btnImport && inputImport) {
      btnImport.addEventListener('click', () => inputImport.click());
      inputImport.addEventListener('change', (e) => this.importBackup(e));
    }
  },

  async loadSettings() {
    document.getElementById('davUrl').value = await DB.getSetting('davUrl') || '';
    document.getElementById('davUser').value = await DB.getSetting('davUser') || '';
    document.getElementById('davPass').value = await DB.getSetting('davPass') || '';
    document.getElementById('davPath').value = await DB.getSetting('davPath') || '/实验记录/';
    document.getElementById('davAutoSync').checked =
      (await DB.getSetting('davAutoSync')) === true ||
      (await DB.getSetting('davAutoSync')) === 'true';
  },

  async saveSettings() {
    const cfg = {
      url: document.getElementById('davUrl').value.trim(),
      user: document.getElementById('davUser').value.trim(),
      pass: document.getElementById('davPass').value,
      path: document.getElementById('davPath').value.trim() || '/实验记录/',
      autoSync: document.getElementById('davAutoSync').checked
    };
    if (!cfg.url || !cfg.user || !cfg.pass) {
      Utils.toast('请填写完整的 WebDAV 配置', 'warning');
      return;
    }
    try {
      await WebDAV.saveConfig(cfg);
      Utils.toast('设置已保存', 'success');
    } catch (err) {
      Utils.toast('保存失败: ' + err.message, 'error');
    }
  },

  async testConnection() {
    const btn = document.getElementById('btnTestDav');
    btn.textContent = '测试中...';
    btn.disabled = true;
    try {
      await this.saveSettings();
      await WebDAV.testConnection();
      Utils.toast('连接成功！', 'success');
    } catch (err) {
      Utils.toast('连接失败: ' + err.message, 'error');
    } finally {
      btn.textContent = '测试连接';
      btn.disabled = false;
    }
  },

  async exportBackup() {
    try {
      const data = await DB.exportAll();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `lab-notebook-backup-${Utils.today()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      Utils.toast('备份已导出', 'success');
    } catch (err) {
      Utils.toast('导出失败: ' + err.message, 'error');
    }
  },

  async importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    e.target.value = ''; // Reset input
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const jsonStr = evt.target.result;
        const data = JSON.parse(jsonStr);
        if (!data || !data.version) {
          throw new Error('无效的备份文件格式');
        }
        
        Utils.toast('导入中，请稍候...', 'info');
        const counts = await DB.importAll(data);
        Utils.toast(`导入成功！恢复: 项目 ${counts.projects}, 实验 ${counts.experiments}`, 'success');
        
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        Utils.toast('导入出错: ' + err.message, 'error');
      }
    };
    reader.onerror = () => Utils.toast('读取文件失败', 'error');
    reader.readAsText(file);
  },

  /* ============ 同步 ============ */

  initSync() {
    document.getElementById('btnSync').addEventListener('click', async () => {
      if (!WebDAV.config) {
        Utils.toast('请先配置 WebDAV 同步设置', 'warning');
        window.location.hash = 'settings';
        return;
      }
      const btn = document.getElementById('btnSync');
      btn.classList.add('syncing');
      try {
        await WebDAV.sync();
        await this.navigateTo(this.currentPage);
      } catch (err) {
        // handled by WebDAV.sync()
      } finally {
        btn.classList.remove('syncing');
      }
    });
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('✓ Service Worker 已注册'))
        .catch(err => console.warn('SW 注册失败:', err));
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
