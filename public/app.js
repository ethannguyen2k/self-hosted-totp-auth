document.addEventListener('DOMContentLoaded', () => {
  // Dark mode toggle functionality
  const toggleSwitch = document.querySelector('#checkbox');
  const currentTheme = localStorage.getItem('theme');

  // Check for saved theme preference or respect OS preference
  if (currentTheme) {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
      toggleSwitch.checked = true;
    }
  } else {
    // Check if user has dark mode set in their OS
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
      toggleSwitch.checked = true;
      localStorage.setItem('theme', 'dark');
    }
  }

  // Switch theme function
  function switchTheme(e) {
    if (e.target.checked) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
  }

  // Event listener for theme switch
  toggleSwitch.addEventListener('change', switchTheme, false);
  
  // DOM Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const uriForm = document.getElementById('uri-form');
  const uriInput = document.getElementById('uri-input');
  const manualForm = document.getElementById('manual-form');
  const issuerInput = document.getElementById('issuer-input');
  const nameInput = document.getElementById('name-input');
  const secretInput = document.getElementById('secret-input');
  const accountsList = document.getElementById('accounts-list');
  const noAccountsPlaceholder = document.getElementById('no-accounts-placeholder');
  const accountTemplate = document.getElementById('account-template');
    // Active accounts and their timers
  const activeAccounts = new Map();
    // QR code scanning elements
  const qrDropArea = document.getElementById('qr-drop-area');
  const qrFileInput = document.getElementById('qr-file-input');
  const qrPreviewArea = document.getElementById('qr-preview-area');
  const qrPreviewImage = document.getElementById('qr-preview-image');
  const qrCancelBtn = document.getElementById('qr-cancel-btn');
  const qrScanBtn = document.getElementById('qr-scan-btn');
  
  // Fetch initial accounts
  fetchAccounts();
  
  // Set up clipboard paste events for QR code
  document.addEventListener('paste', (e) => {
    // Check if qrcode tab is active
    const qrcodeTab = document.getElementById('qrcode-tab');
    if (!qrcodeTab.classList.contains('active')) {
      return;
    }
    
    // Get clipboard items
    const items = e.clipboardData.items;
    let imageFile = null;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageFile = items[i].getAsFile();
        break;
      }
    }
    
    if (imageFile) {
      e.preventDefault();
      handleQRCodeFile(imageFile);
    }
  });
    // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons and contents
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      btn.classList.add('active');
      const tabId = `${btn.dataset.tab}-tab`;
      document.getElementById(tabId).classList.add('active');
      
      // Reset QR preview if switching away from QR tab
      if (btn.dataset.tab !== 'qrcode' && qrPreviewArea.style.display === 'block') {
        qrCancelBtn.click();
      }
    });
  });
  
  // URI form submission
  uriForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const uri = uriInput.value.trim();
    
    if (!uri) {
      alert('Please enter a valid URI');
      return;
    }
    
    fetch('/api/accounts/uri', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uri }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      uriInput.value = '';
      fetchAccounts();
    })
    .catch(error => {
      alert(`Error: ${error.message}`);
    });
  });
  
  // Manual form submission
  manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = nameInput.value.trim();
    const issuer = issuerInput.value.trim();
    const secret = secretInput.value.trim().replace(/\s+/g, '').toUpperCase();
    
    if (!name || !secret) {
      alert('Please enter both name and secret key');
      return;
    }
    
    fetch('/api/accounts/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, issuer, secret }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      nameInput.value = '';
      issuerInput.value = '';
      secretInput.value = '';
      fetchAccounts();
    })
    .catch(error => {
      alert(`Error: ${error.message}`);
    });
  });
  
  // Update in fetchAccounts() function
  function fetchAccounts() {
    fetch('/api/accounts')
      .then(response => response.json())
      .then(accounts => {
        renderAccounts(accounts);
      })
      .catch(error => {
        console.error('Error fetching accounts:', error);
      });
  }
  
  // Render accounts
  function renderAccounts(accounts) {
    // Clear previous accounts that are no longer in the list
    const currentIds = accounts.map(account => account.id);
    
    for (const [id, timer] of activeAccounts.entries()) {
      if (!currentIds.includes(id)) {
        clearInterval(timer);
        activeAccounts.delete(id);
      }
    }
    
    // Show/hide placeholder
    if (accounts.length === 0) {
      noAccountsPlaceholder.hidden = false;
    } else {
      noAccountsPlaceholder.hidden = true;
    }
    
    // Remove accounts that are no longer in the database
    const accountElements = accountsList.querySelectorAll('.account-card');
    accountElements.forEach(element => {
      const id = element.dataset.id;
      if (!currentIds.includes(id)) {
        element.remove();
      }
    });
    
    // Add or update accounts
    accounts.forEach(account => {
      let accountElement = accountsList.querySelector(`.account-card[data-id="${account.id}"]`);
      
      if (!accountElement) {
        // Create new account element
        const template = accountTemplate.content.cloneNode(true);
        accountElement = template.querySelector('.account-card');
        accountElement.dataset.id = account.id;
        
        // Set up remove button
        const removeBtn = accountElement.querySelector('.remove-btn');
        removeBtn.addEventListener('click', () => removeAccount(account.id));
        
        accountsList.appendChild(accountElement);
      }
      
      // Update account info
      accountElement.querySelector('.account-issuer').textContent = account.issuer || 'Unknown';
      accountElement.querySelector('.account-name').textContent = account.name;
      
      // Set up or update token refreshing
      if (!activeAccounts.has(account.id)) {
        updateToken(account.id);
        const timer = setInterval(() => updateToken(account.id), 1000);
        activeAccounts.set(account.id, timer);
      }
    });
  }
  
  // Update token for an account
  function updateToken(accountId) {
    console.log(`Updating token for ${accountId}`);
    
    fetch(`/api/accounts/${accountId}/code`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const accountElement = accountsList.querySelector(`.account-card[data-id="${accountId}"]`);
        if (!accountElement) return;
        
        console.log(`Token update for ${accountId}:`, data);
        
        // Update token display if we have a token
        if (data.token) {
          accountElement.querySelector('.token-value').textContent = formatToken(data.token);
        } else {
          console.error(`No token received for ${accountId}`);
          accountElement.querySelector('.token-value').textContent = 'ERROR';
        }
        
        // Update timer bar
        const percentage = (data.timeRemaining / 30) * 100;
        const timerBar = accountElement.querySelector('.timer-bar');
        timerBar.style.width = `${percentage}%`;
        
        // Change color when getting close to expiration
        if (data.timeRemaining <= 5) {
          timerBar.style.backgroundColor = '#ea4335'; // Red
        } else if (data.timeRemaining <= 10) {
          timerBar.style.backgroundColor = '#fbbc04'; // Yellow
        } else {
          timerBar.style.backgroundColor = '#4285f4'; // Blue
        }
      })
      .catch(error => {
        console.error(`Error updating token for account ${accountId}:`, error);
        
        // Update UI to show error
        const accountElement = accountsList.querySelector(`.account-card[data-id="${accountId}"]`);
        if (accountElement) {
          accountElement.querySelector('.token-value').textContent = 'ERROR';
        }
      });
  }
  
  // Format token for better readability
  function formatToken(token) {
    if (token.length === 6) {
      return `${token.substring(0, 3)} ${token.substring(3)}`;
    }
    return token;
  }
  
  // Remove account
  function removeAccount(accountId) {
    console.log(`Attempting to remove account: ${accountId}`);
    
    if (!confirm('Are you sure you want to remove this account?')) {
      return;
    }
    
    fetch(`/api/accounts/${accountId}`, {
      method: 'DELETE',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`Account removal response:`, data);
        
        if (data.success) {
          // Clear timer
          if (activeAccounts.has(accountId)) {
            clearInterval(activeAccounts.get(accountId));
            activeAccounts.delete(accountId);
          }
          
          // Remove from DOM
          const accountElement = accountsList.querySelector(`.account-card[data-id="${accountId}"]`);
          if (accountElement) {
            accountElement.remove();
            console.log(`Removed account element from DOM`);
          }
          
          // Show placeholder if no accounts left
          if (accountsList.querySelectorAll('.account-card').length === 0) {
            noAccountsPlaceholder.hidden = false;
          }
        }
      })      .catch(error => {
        console.error(`Error removing account ${accountId}:`, error);
        alert('Failed to remove account. Please try again.');
      });
  }
  
  // Add QR code drag and drop handling
  qrDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    qrDropArea.classList.add('highlight');
  });

  qrDropArea.addEventListener('dragleave', () => {
    qrDropArea.classList.remove('highlight');
  });
  qrDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    qrDropArea.classList.remove('highlight');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.match('image.*')) {
      handleQRCodeFile(file);
    }
  });
  
  // Add click handler to the drop area to focus it for keyboard events
  qrDropArea.addEventListener('click', () => {
    qrDropArea.focus();
  });
  
  // Make the drop area focusable
  qrDropArea.setAttribute('tabindex', '0');
  
  // Add keyboard event for paste shortcut reminder
  qrDropArea.addEventListener('keydown', (e) => {
    // If user presses Ctrl+V when drop area is focused
    if (e.ctrlKey && e.key === 'v') {
      // The actual paste event is handled by the document paste event handler
      e.preventDefault();
    }
  });

  qrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleQRCodeFile(file);
    }
  });

  qrCancelBtn.addEventListener('click', () => {
    qrPreviewArea.style.display = 'none';
    qrDropArea.style.display = 'block';
    qrPreviewImage.src = '';
  });

  qrScanBtn.addEventListener('click', () => {
    scanQRCode();
  });
  function handleQRCodeFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      qrPreviewImage.src = e.target.result;
      qrDropArea.style.display = 'none';
      qrPreviewArea.style.display = 'block';
      
      // Option to automatically scan the QR code after loading
      // Uncomment the next line if you want auto-scanning
      // setTimeout(scanQRCode, 500);
    };
    
    reader.readAsDataURL(file);
  }

  function scanQRCode() {
    const img = new Image();
    
    img.onload = () => {
      // Create a canvas to draw the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas dimensions to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      // Get image data for QR scanning
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        console.log('QR Code found:', code.data);
        
        // Check if the data starts with 'otpauth://'
        if (code.data.startsWith('otpauth://')) {
          // Use your existing URI form submission logic
          uriInput.value = code.data;
          
          // Switch to URI tab and submit the form
          tabBtns.forEach(btn => {
            if (btn.dataset.tab === 'uri') {
              btn.click();
            }
          });
          
          uriForm.dispatchEvent(new Event('submit'));
        } else {
          alert('Invalid QR code: Not a valid authentication URI');
        }
      } else {
        alert('No QR code found in the image. Please try a different image.');
      }
      
      // Reset the QR code scanning UI
      qrCancelBtn.click();
    };
    
    img.src = qrPreviewImage.src;
  }
});