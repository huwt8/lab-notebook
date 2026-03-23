/* ========================================================
   utils.js - 工具函数
   ======================================================== */

const Utils = {
  /**
   * 生成 UUID v4
   */
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  /**
   * 生成实验编号 EXP-YYYY-NNN
   */
  generateExpNo(count) {
    const year = new Date().getFullYear();
    const num = String(count + 1).padStart(3, '0');
    return `EXP-${year}-${num}`;
  },

  /**
   * 当前日期 (YYYY-MM-DD)
   */
  today() {
    return new Date().toISOString().slice(0, 10);
  },

  /**
   * 当前时间 (HH:MM)
   */
  nowTime() {
    return new Date().toTimeString().slice(0, 5);
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(date, time) {
    if (!date) return '';
    const d = time ? `${date} ${time}` : date;
    return d;
  },

  /**
   * 计算质量浓度 g/L
   * @param {number} massG 溶质质量 (g)
   * @param {number} volumeML 溶液体积 (mL)
   * @returns {number|null}
   */
  calcMassConc(massG, volumeML) {
    if (!massG || !volumeML || volumeML <= 0) return null;
    return massG / (volumeML / 1000); // g / L
  },

  /**
   * 计算摩尔浓度 mol/L
   * @param {number} massG 溶质质量 (g)
   * @param {number} mw 分子量 (g/mol)
   * @param {number} volumeML 溶液体积 (mL)
   * @returns {number|null}
   */
  calcMolarConcFromMass(massG, mw, volumeML) {
    if (!massG || !mw || !volumeML || mw <= 0 || volumeML <= 0) return null;
    const moles = massG / mw;
    return moles / (volumeML / 1000); // mol / L
  },

  /**
   * 从摩尔量计算摩尔浓度 mol/L
   * @param {number} moles 摩尔量 (mol)
   * @param {number} volumeML 溶液体积 (mL)
   * @returns {number|null}
   */
  calcMolarConcFromMoles(moles, volumeML) {
    if (!moles || !volumeML || volumeML <= 0) return null;
    return moles / (volumeML / 1000); // mol / L
  },

  /**
   * 从摩尔量和分子量计算质量 (g)
   */
  calcMassFromMoles(moles, mw) {
    if (!moles || !mw) return null;
    return moles * mw;
  },

  /**
   * 从质量和分子量计算摩尔量 (mol)
   */
  calcMolesFromMass(massG, mw) {
    if (!massG || !mw || mw <= 0) return null;
    return massG / mw;
  },

  /**
   * 格式化数字（保留指定位数）
   */
  formatNum(val, digits = 4) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return Number(val).toFixed(digits);
  },

  /**
   * 显示 Toast 通知
   */
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  /**
   * 防抖
   */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * ISO 时间戳
   */
  isoNow() {
    return new Date().toISOString();
  }
};
