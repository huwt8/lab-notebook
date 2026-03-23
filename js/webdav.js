/* ========================================================
   webdav.js - WebDAV 同步客户端 (123云盘)
   ======================================================== */

const WebDAV = {
  config: null,
  syncing: false,

  /**
   * 加载配置
   */
  async loadConfig() {
    const url = await DB.getSetting('davUrl');
    const user = await DB.getSetting('davUser');
    const pass = await DB.getSetting('davPass');
    const path = await DB.getSetting('davPath');
    const autoSync = await DB.getSetting('davAutoSync');

    if (url && user && pass) {
      this.config = {
        url: url.replace(/\/+$/, ''),
        user,
        pass,
        path: (path || '/实验记录/').replace(/\/?$/, '/'),
        autoSync: autoSync === true || autoSync === 'true'
      };
    } else {
      this.config = null;
    }
    return this.config;
  },

  /**
   * 保存配置
   */
  async saveConfig(cfg) {
    await DB.saveSetting('davUrl', cfg.url);
    await DB.saveSetting('davUser', cfg.user);
    await DB.saveSetting('davPass', cfg.pass);
    await DB.saveSetting('davPath', cfg.path);
    await DB.saveSetting('davAutoSync', cfg.autoSync);
    await this.loadConfig();
  },

  /**
   * 获取 Basic Auth 头
   */
  _authHeader() {
    if (!this.config) return {};
    const encoded = btoa(unescape(encodeURIComponent(
      this.config.user + ':' + this.config.pass
    )));
    return {
      'Authorization': 'Basic ' + encoded
    };
  },

  /**
   * 完整 URL
   */
  _fullUrl(filename) {
    return this.config.url + this.config.path + (filename || '');
  },

  /**
   * 测试连接
   */
  async testConnection() {
    if (!this.config) throw new Error('未配置 WebDAV');

    this._log('测试连接: ' + this.config.url + this.config.path, 'info');

    try {
      // 先尝试 PROPFIND 请求检查目录
      const resp = await fetch(this._fullUrl(''), {
        method: 'PROPFIND',
        headers: {
          ...this._authHeader(),
          'Depth': '0',
          'Content-Type': 'application/xml'
        }
      });

      if (resp.status === 207 || resp.status === 200) {
        this._log('✓ 连接成功!', 'success');
        this._updateStatus('online');
        return true;
      } else if (resp.status === 404) {
        // 目录不存在，尝试创建
        this._log('目录不存在，尝试创建...', 'info');
        await this._mkdirRecursive(this.config.path);
        this._log('✓ 目录创建成功!', 'success');
        this._updateStatus('online');
        return true;
      } else if (resp.status === 401 || resp.status === 403) {
        throw new Error('认证失败，请检查用户名和密码');
      } else {
        throw new Error(`服务器响应: ${resp.status} ${resp.statusText}`);
      }
    } catch (err) {
      if (err.message.includes('认证失败') || err.message.includes('服务器响应')) {
        this._log('✗ ' + err.message, 'error');
        this._updateStatus('error');
        throw err;
      }
      // 网络错误 - 可能是 CORS 问题，回退到 GET 测试
      try {
        const resp2 = await fetch(this._fullUrl(''), {
          method: 'GET',
          headers: this._authHeader()
        });
        if (resp2.ok || resp2.status === 207) {
          this._log('✓ 连接成功! (GET 模式)', 'success');
          this._updateStatus('online');
          return true;
        }
        throw new Error(`连接失败: ${resp2.status}`);
      } catch (err2) {
        this._log('✗ 连接失败: ' + err2.message, 'error');
        this._updateStatus('error');
        throw new Error('无法连接到 WebDAV 服务器。请检查网络和地址设置。如在浏览器中使用，请确认服务器支持 CORS。');
      }
    }
  },

  /**
   * 递归创建目录
   */
  async _mkdirRecursive(path) {
    const parts = path.split('/').filter(Boolean);
    let current = '/';
    for (const part of parts) {
      current += part + '/';
      try {
        await fetch(this.config.url + current, {
          method: 'MKCOL',
          headers: this._authHeader()
        });
      } catch (e) {
        // 忽略已存在的目录
      }
    }
  },

  /**
   * 上传数据到 WebDAV
   */
  async upload() {
    if (!this.config) {
      this._log('未配置 WebDAV，跳过上传', 'info');
      return;
    }
    if (this.syncing) return;

    this.syncing = true;
    this._updateStatus('syncing');
    this._log('开始上传...', 'info');

    try {
      const data = await DB.exportAll();
      const json = JSON.stringify(data, null, 2);

      const resp = await fetch(this._fullUrl('lab_data.json'), {
        method: 'PUT',
        headers: {
          ...this._authHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: json
      });

      if (resp.ok || resp.status === 201 || resp.status === 204) {
        this._log(`✓ 上传成功 (${data.chemicals.length} 药品, ${data.experiments.length} 实验)`, 'success');
        this._updateStatus('online');
        await DB.saveSetting('lastSyncTime', Utils.isoNow());
      } else if (resp.status === 401 || resp.status === 403) {
        throw new Error('认证失败');
      } else {
        throw new Error(`上传失败: ${resp.status}`);
      }
    } catch (err) {
      this._log('✗ 上传失败: ' + err.message, 'error');
      this._updateStatus('error');
      throw err;
    } finally {
      this.syncing = false;
    }
  },

  /**
   * 从 WebDAV 下载并合并数据
   */
  async download() {
    if (!this.config) {
      this._log('未配置 WebDAV，跳过下载', 'info');
      return;
    }
    if (this.syncing) return;

    this.syncing = true;
    this._updateStatus('syncing');
    this._log('开始下载...', 'info');

    try {
      const resp = await fetch(this._fullUrl('lab_data.json'), {
        method: 'GET',
        headers: this._authHeader()
      });

      if (resp.status === 404) {
        this._log('远程无数据文件，将在首次上传时创建', 'info');
        this._updateStatus('online');
        return;
      }

      if (!resp.ok) {
        throw new Error(`下载失败: ${resp.status}`);
      }

      const data = await resp.json();
      const result = await DB.importAll(data);
      this._log(`✓ 下载完成 (合并 ${result.chemicals} 药品, ${result.experiments} 实验)`, 'success');
      this._updateStatus('online');
      await DB.saveSetting('lastSyncTime', Utils.isoNow());
      return result;
    } catch (err) {
      this._log('✗ 下载失败: ' + err.message, 'error');
      this._updateStatus('error');
      throw err;
    } finally {
      this.syncing = false;
    }
  },

  /**
   * 完整同步：先下载合并，再上传
   */
  async sync() {
    try {
      await this.download();
      await this.upload();
      Utils.toast('同步完成', 'success');
    } catch (err) {
      Utils.toast('同步失败: ' + err.message, 'error');
    }
  },

  /**
   * 数据变更时触发自动同步（防抖）
   */
  autoSyncTrigger: Utils.debounce(async function() {
    if (WebDAV.config && WebDAV.config.autoSync && !WebDAV.syncing) {
      try {
        await WebDAV.upload();
      } catch (e) {
        // 安静处理自动同步错误
        console.warn('自动同步失败:', e.message);
      }
    }
  }, 2000),

  /**
   * 通知数据变更
   */
  notifyChange() {
    this.autoSyncTrigger();
  },

  /**
   * 更新同步状态显示
   */
  _updateStatus(status) {
    const dot = document.querySelector('#syncStatus .sync-dot');
    const text = document.querySelector('#syncStatus .sync-text');
    if (!dot || !text) return;

    dot.className = 'sync-dot ' + status;
    const labels = {
      offline: '未连接',
      online: '已连接',
      syncing: '同步中...',
      error: '同步错误'
    };
    text.textContent = labels[status] || status;
  },

  /**
   * 写入同步日志
   */
  _log(message, type = 'info') {
    const container = document.getElementById('logEntries');
    if (!container) return;

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${message}`;
    container.insertBefore(entry, container.firstChild);

    // 限制日志条目数
    while (container.children.length > 50) {
      container.removeChild(container.lastChild);
    }

    console.log(`[WebDAV ${type}] ${message}`);
  }
};
