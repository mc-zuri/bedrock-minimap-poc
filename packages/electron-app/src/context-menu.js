import { Menu } from 'electron';

export function createContextMenu(window, config) {
  const template = [
    {
      label: 'Opacity',
      submenu: [
        {
          label: '30%',
          type: 'radio',
          checked: config.getOpacity() === 0.3,
          click: () => setOpacity(window, config, 0.3)
        },
        {
          label: '50%',
          type: 'radio',
          checked: config.getOpacity() === 0.5,
          click: () => setOpacity(window, config, 0.5)
        },
        {
          label: '70%',
          type: 'radio',
          checked: config.getOpacity() === 0.7,
          click: () => setOpacity(window, config, 0.7)
        },
        {
          label: '80%',
          type: 'radio',
          checked: config.getOpacity() === 0.8,
          click: () => setOpacity(window, config, 0.8)
        },
        {
          label: '90%',
          type: 'radio',
          checked: config.getOpacity() === 0.9,
          click: () => setOpacity(window, config, 0.9)
        },
        {
          label: '100%',
          type: 'radio',
          checked: config.getOpacity() === 1.0,
          click: () => setOpacity(window, config, 1.0)
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Always On Top',
      type: 'checkbox',
      checked: config.get('alwaysOnTop'),
      click: () => {
        const newValue = config.toggleAlwaysOnTop();
        window.setAlwaysOnTop(newValue);
        console.log(`Always on top: ${newValue}`);
        
        // Notify renderer about settings change
        window.webContents.send('settings-changed', { alwaysOnTop: newValue });
      }
    },
    {
      label: 'Window Frame',
      submenu: [
        {
          label: 'Native Frame (with minimize/close buttons)',
          type: 'radio',
          checked: !config.get('frameless'),
          click: () => {
            if (config.get('frameless')) {
              config.toggleFrameless();
              showRestartDialog(window);
            }
          }
        },
        {
          label: 'Borderless (custom controls)',
          type: 'radio',
          checked: config.get('frameless'),
          click: () => {
            if (!config.get('frameless')) {
              config.toggleFrameless();
              showRestartDialog(window);
            }
          }
        }
      ]
    },
    {
      label: 'Overlay Mode',
      type: 'checkbox',
      checked: config.get('overlayMode'),
      click: () => {
        const newValue = config.toggleOverlayMode();
        console.log(`Overlay mode: ${newValue}`);
        
        // Notify renderer about settings change
        window.webContents.send('settings-changed', { overlayMode: newValue });
      }
    },
    { type: 'separator' },
    {
      label: 'Window Size',
      submenu: [
        {
          label: 'Small (300x300)',
          click: () => setWindowSize(window, config, 300, 300)
        },
        {
          label: 'Medium (400x400)',
          click: () => setWindowSize(window, config, 400, 400)
        },
        {
          label: 'Large (600x600)',
          click: () => setWindowSize(window, config, 600, 600)
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Hide Controls',
      type: 'checkbox',
      checked: config.get('hideControls') || false,
      click: () => {
        const newValue = !config.get('hideControls');
        config.set('hideControls', newValue);
        console.log(`Controls hidden: ${newValue}`);
        
        // Notify renderer about settings change
        window.webContents.send('settings-changed', { hideControls: newValue });
      }
    },
    {
      label: 'Reset Settings',
      click: () => {
        config.reset();
        const settings = config.getAll();
        
        // Apply reset settings to window
        window.setOpacity(settings.opacity);
        window.setAlwaysOnTop(settings.alwaysOnTop);
        window.setBounds(settings.windowBounds);
        
        console.log('Settings reset to defaults');
        
        // Notify renderer about settings change
        window.webContents.send('settings-changed', settings);
      }
    },
    { type: 'separator' },
    {
      label: 'Minimize',
      click: () => window.minimize()
    },
    {
      label: 'Close',
      click: () => window.close()
    }
  ];

  return Menu.buildFromTemplate(template);
}

function setOpacity(window, config, opacity) {
  const actualOpacity = config.setOpacity(opacity);
  window.setOpacity(actualOpacity);
  console.log(`Opacity set to ${(actualOpacity * 100).toFixed(0)}%`);
  
  // Notify renderer about settings change
  window.webContents.send('settings-changed', { opacity: actualOpacity });
}

function setWindowSize(window, config, width, height) {
  const currentBounds = window.getBounds();
  const newBounds = {
    x: currentBounds.x,
    y: currentBounds.y,
    width,
    height
  };
  
  const constrainedBounds = config.setWindowBounds(newBounds);
  window.setBounds(constrainedBounds);
  console.log(`Window size set to ${constrainedBounds.width}x${constrainedBounds.height}`);
}

function showRestartDialog(window) {
  const { dialog } = require('electron');
  dialog.showMessageBox(window, {
    type: 'info',
    title: 'Restart Required',
    message: 'Window frame changes require restarting the application to take effect.',
    buttons: ['OK']
  });
}