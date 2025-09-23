(function() {
  // Verificar si estamos en una página que podría estar protegida
  const currentPath = window.location.pathname;
  
  if (currentPath.startsWith('/pages/')) {
    const pageHandle = currentPath.split('/pages/')[1];
    const shop = window.Shopify?.shop || window.location.hostname.split('.')[0];
    
    checkPageProtection(shop, pageHandle);
  }
  
  async function checkPageProtection(shop, pageHandle) {
    try {
      const response = await fetch(`/apps/password-protection/password-check?shop=${shop}&page=${pageHandle}`);
      const data = await response.json();
      
      if (data.protected) {
        showPasswordForm(shop, pageHandle, data.pageTitle);
      }
    } catch (error) {
      console.error('Error checking page protection:', error);
    }
  }
  
  function showPasswordForm(shop, pageHandle, pageTitle) {
    // Ocultar el contenido original
    document.body.style.display = 'none';
    
    // Crear formulario de contraseña
    const form = `
      <div id="password-protection-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      ">
        <div style="
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
          width: 90%;
        ">
          <h2>Protected Page</h2>
          <p>This page is password protected. Please enter the password to continue.</p>
          <form id="password-form">
            <input type="password" id="page-password" placeholder="Enter password" style="
              width: 100%;
              padding: 12px;
              margin: 1rem 0;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 16px;
            ">
            <button type="submit" style="
              background: #007cba;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
            ">Access Page</button>
          </form>
          <div id="error-message" style="color: red; margin-top: 1rem;"></div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', form);
    document.getElementById('page-password').focus();
    
    document.getElementById('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('page-password').value;
      await validatePassword(shop, pageHandle, password);
    });
  }
  
  async function validatePassword(shop, pageHandle, password) {
    const errorElement = document.getElementById('error-message');
    
    try {
      const formData = new FormData();
      formData.append('shop', shop);
      formData.append('page', pageHandle);
      formData.append('password', password);
      
      const response = await fetch('/apps/password-protection/password-check', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Remover overlay y mostrar contenido
        document.getElementById('password-protection-overlay').remove();
        document.body.style.display = '';
        
        // Guardar en sessionStorage para no pedir contraseña otra vez en esta sesión
        sessionStorage.setItem(`protected_${pageHandle}`, 'true');
      } else {
        errorElement.textContent = data.message || 'Invalid password';
        document.getElementById('page-password').value = '';
        document.getElementById('page-password').focus();
      }
    } catch (error) {
      errorElement.textContent = 'Error validating password';
    }
  }
  
  // Verificar si ya se validó la contraseña en esta sesión
  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/pages/')) {
    const pageHandle = currentPath.split('/pages/')[1];
    if (sessionStorage.getItem(`protected_${pageHandle}`) === 'true') {
      return; // No mostrar formulario si ya se validó
    }
  }
})();