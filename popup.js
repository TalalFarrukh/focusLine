(() => {
  const blurToggle = document.getElementById('blurEnabled');
  const tabBlockingToggle = document.getElementById('tabBlockingEnabled');
  const statusElement = document.getElementById('status');

  // Load current settings
  function loadSettings() {
    chrome.storage.sync.get({
      blurEnabled: true,
      tabBlockingEnabled: true
    }, (items) => {
      blurToggle.checked = items.blurEnabled;
      tabBlockingToggle.checked = items.tabBlockingEnabled;
    });
  }

  // Save settings
  function saveSettings() {
    const settings = {
      blurEnabled: blurToggle.checked,
      tabBlockingEnabled: tabBlockingToggle.checked
    };

    chrome.storage.sync.set(settings, () => {
      // Show status message
      statusElement.textContent = 'Settings saved';
      statusElement.classList.add('show');
      
      // Hide status after 2 seconds
      setTimeout(() => {
        statusElement.classList.remove('show');
      }, 2000);

      // Notify content scripts and background script of changes
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && !tab.url.startsWith('chrome://')) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'settingsChanged',
              settings: settings
            }).catch(() => {
              // Ignore errors for tabs that can't receive messages
            });
          }
        });
      });

      // Notify background script
      chrome.runtime.sendMessage({
        type: 'settingsChanged',
        settings: settings
      }).catch(() => {
        // Background script might not be ready
      });
    });
  }

  // Event listeners
  blurToggle.addEventListener('change', saveSettings);
  tabBlockingToggle.addEventListener('change', saveSettings);

  // Load settings when popup opens
  loadSettings();
})();
