// custom-alert.js - Save this as a separate file in your public directory

/**
 * Custom Alert System
 * A replacement for the browser's native alert() and confirm() dialogs
 */
class CustomAlertSystem {
  constructor() {
    this.element = null;
    this.messageElement = null;
    this.titleElement = null;
    this.confirmButton = null;
    this.cancelButton = null;
    this.closeButton = null;
    this.resolvePromise = null;
    
    this.createAlertElement();
    this.initializeEventListeners();
  }
  
  createAlertElement() {
    // Create the custom alert HTML structure
    const alertHTML = `
      <div id="custom-alert" class="custom-alert">
        <div class="custom-alert-content">
          <div class="custom-alert-header">
            <span class="custom-alert-title">Notice</span>
            <button class="custom-alert-close" aria-label="Close">&times;</button>
          </div>
          <div class="custom-alert-body">
            <p id="custom-alert-message"></p>
          </div>
          <div class="custom-alert-footer">
            <button id="custom-alert-cancel" class="btn secondary">Cancel</button>
            <button id="custom-alert-confirm" class="btn">OK</button>
          </div>
        </div>
      </div>
    `;
    
    // Create style element
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .custom-alert {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        justify-content: center;
        align-items: center;
      }
        .custom-alert-content {
        background-color: var(--card-bg-color, white);
        border-radius: 8px;
        box-shadow: 0 4px 8px var(--shadow-color, rgba(0, 0, 0, 0.2));
        max-width: 90%;
        width: 400px;
        overflow: hidden;
        animation: alertFadeIn 0.3s ease;
      }
      
      .custom-alert.danger .custom-alert-content {
        border-left: 4px solid var(--danger-color, #ea4335);
      }
        .custom-alert.danger .custom-alert-title {
        color: var(--danger-color, #ea4335);
      }
      
      .custom-alert.success .custom-alert-content {
        border-left: 4px solid var(--secondary-color, #34a853);
      }
      
      .custom-alert.success .custom-alert-title {
        color: var(--secondary-color, #34a853);
      }
      
      @keyframes alertFadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .custom-alert-header {
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color, #ddd);
      }
      
      .custom-alert-title {
        font-weight: bold;
        color: var(--text-color, #333);
      }
      
      .custom-alert-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--gray-color, #5f6368);
      }
      
      .custom-alert-close:hover {
        color: var(--danger-color, #ea4335);
      }
      
      .custom-alert-body {
        padding: 1rem;
      }
      
      .custom-alert-body p {
        margin: 0;
        color: var(--text-color, #333);
      }      .custom-alert-footer {
        padding: 1rem;
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        border-top: 1px solid var(--border-color, #ddd);
      }
      
      .custom-alert.alert .custom-alert-cancel,
      .custom-alert.success .custom-alert-cancel {
        display: none;
      }
      
      .custom-alert.confirm .custom-alert-cancel {
        display: inline-block;
      }
      
      /* Styling for confirm button in danger/success modes */
      .custom-alert-confirm.danger {
        background-color: var(--danger-color, #ea4335);
      }
      
      .custom-alert-confirm.danger:hover {
        background-color: #d32f2f; /* Darker red on hover */
      }
      
      .custom-alert-confirm.secondary {
        background-color: var(--secondary-color, #34a853);
      }
      
      .custom-alert-confirm.secondary:hover {
        background-color: #2e7d32; /* Darker green on hover */
      }
    `;
    
    // Create container and add to DOM
    const container = document.createElement('div');
    container.innerHTML = alertHTML;
    document.head.appendChild(styleElement);
    document.body.appendChild(container.firstElementChild);
    
    // Store references to elements
    this.element = document.getElementById('custom-alert');
    this.messageElement = document.getElementById('custom-alert-message');
    this.titleElement = document.querySelector('.custom-alert-title');
    this.confirmButton = document.getElementById('custom-alert-confirm');
    this.cancelButton = document.getElementById('custom-alert-cancel');
    this.closeButton = document.querySelector('.custom-alert-close');
  }
  
  initializeEventListeners() {
    // Confirm button
    this.confirmButton.addEventListener('click', () => {
      this.hide();
      if (this.resolvePromise) {
        this.resolvePromise(true);
        this.resolvePromise = null;
      }
    });
    
    // Cancel button
    this.cancelButton.addEventListener('click', () => {
      this.hide();
      if (this.resolvePromise) {
        this.resolvePromise(false);
        this.resolvePromise = null;
      }
    });
    
    // Close button
    this.closeButton.addEventListener('click', () => {
      this.hide();
      if (this.resolvePromise) {
        this.resolvePromise(false);
        this.resolvePromise = null;
      }
    });
    
    // Close on click outside
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.hide();
        if (this.resolvePromise) {
          this.resolvePromise(false);
          this.resolvePromise = null;
        }
      }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.element.style.display === 'flex') {
        this.hide();
        if (this.resolvePromise) {
          this.resolvePromise(false);
          this.resolvePromise = null;
        }
      }
    });
  }
    /**
   * Show the alert dialog
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @param {string} options.title - Custom title
   * @param {string} options.confirmText - Custom confirm button text
   * @param {string} options.cancelText - Custom cancel button text
   * @param {boolean} options.isConfirm - Whether this is a confirmation dialog
   * @param {boolean} options.isDanger - Whether this is a dangerous action
   * @returns {Promise} - Resolves to true if confirmed, false otherwise
   */  show(message, options = {}) {
    const {
      title = 'Notice',
      confirmText = 'OK',
      cancelText = 'Cancel',
      isConfirm = false,
      isDanger = false,
      isSuccess = false
    } = options;
    
    // Set message and title
    this.messageElement.textContent = message;
    this.titleElement.textContent = title;
    
    // Set button text
    this.confirmButton.textContent = confirmText;
    this.cancelButton.textContent = cancelText;    // Show/hide cancel button based on dialog type
    if (isConfirm) {
      this.element.classList.remove('alert', 'success');
      this.element.classList.add('confirm');
      this.cancelButton.style.display = 'inline-block'; // Explicitly show cancel button
    } else {
      this.element.classList.remove('confirm');
      if (isSuccess) {
        this.element.classList.add('success');
        this.element.classList.remove('alert');
      } else {
        this.element.classList.add('alert');
        this.element.classList.remove('success');
      }
      this.cancelButton.style.display = 'none'; // Explicitly hide cancel button
    }
    
    // Apply danger styling if needed
    if (isDanger) {
      this.element.classList.add('danger');
      this.confirmButton.classList.add('danger');
      this.element.classList.remove('success');
      this.confirmButton.classList.remove('secondary');
    } else if (isSuccess) {
      this.element.classList.add('success');
      this.confirmButton.classList.add('secondary');
      this.element.classList.remove('danger');
      this.confirmButton.classList.remove('danger');
    } else {
      this.element.classList.remove('danger', 'success');
      this.confirmButton.classList.remove('danger', 'secondary');
    }
    
    // Show the dialog
    this.element.style.display = 'flex';
    this.confirmButton.focus();
    
    // Return a promise that resolves when a button is clicked
    return new Promise(resolve => {
      this.resolvePromise = resolve;
    });
  }
  
  /**
   * Hide the alert dialog
   */
  hide() {
    this.element.style.display = 'none';
  }
  
  /**
   * Show an alert dialog (replacement for window.alert)
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Promise} - Resolves when the user clicks OK
   */
  alert(message, options = {}) {
    return this.show(message, { 
      ...options, 
      isConfirm: false,
      confirmText: options.confirmText || 'OK' 
    });
  }
    /**
   * Show a confirmation dialog (replacement for window.confirm)
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Promise} - Resolves to true if confirmed, false otherwise
   */
  confirm(message, options = {}) {
    return this.show(message, { ...options, isConfirm: true });
  }
    /**
   * Show a dangerous confirmation dialog for destructive actions
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Promise} - Resolves to true if confirmed, false otherwise
   */
  dangerConfirm(message, options = {}) {
    return this.show(message, { ...options, isConfirm: true, isDanger: true });
  }
  
  /**
   * Show a success message alert
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Promise} - Resolves when the user clicks OK
   */  success(message, options = {}) {
    return this.show(message, { 
      ...options, 
      isConfirm: false, 
      isDanger: false,
      isSuccess: true,
      title: options.title || 'Success',
      confirmText: options.confirmText || 'OK'
    });
  }
}

// Initialize and expose the custom alert system
window.customAlert = new CustomAlertSystem();