document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('itemForm');
  const itemsContainer = document.getElementById('lostItems');
  const API_BASE_URL = 'http://localhost:3000/api';

  // Toggle form visibility
  const formSection = document.getElementById('reportFormSection');
  const toggleButton = document.getElementById('toggleFormBtn');

  toggleButton.addEventListener('click', () => {
    const isVisible = formSection.style.display === 'block';
    formSection.style.display = isVisible ? 'none' : 'block';
    toggleButton.innerHTML = isVisible
      ? '<i class="fas fa-plus-circle"></i> Report an Item'
      : '<i class="fas fa-minus-circle"></i> Hide Form';
  });

  // Handle image preview
  document.getElementById('image').addEventListener('change', function () {
    const fileName = this.files[0]?.name || 'No file chosen';
    document.querySelector('.file-name')?.textContent = fileName;
  });

  // Form submission
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = this.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    const formData = new FormData(this);
    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      console.log('[Upload Success]', result);
      showAlert('Item submitted successfully!', 'success');
      form.reset();
      document.querySelector('.file-name').textContent = 'No file chosen';
      loadItems();
      formSection.style.display = 'none';
      toggleButton.innerHTML = '<i class="fas fa-plus-circle"></i> Report an Item';
    } catch (err) {
      console.error('[Upload Error]', err);
      showAlert(`Failed to submit item: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
    }
  });

  // Load items from API
  async function loadItems(filter = 'all') {
    try {
      itemsContainer.innerHTML = '<div class="loading">Loading items...</div>';

      const res = await fetch(`${API_BASE_URL}/`);
      if (!res.ok) throw new Error('Failed to fetch items');

      const items = await res.json();
      console.log('[Loaded Items]', items.length);
      renderItems(items, filter);
    } catch (err) {
      console.error('[Load Items Error]', err);
      itemsContainer.innerHTML = `<div class="error">Error loading items: ${err.message}</div>`;
    }
  }

  // Render items to DOM
  function renderItems(items, filter) {
    if (items.length === 0) {
      itemsContainer.innerHTML = '<div class="no-items">No items found</div>';
      return;
    }

    itemsContainer.innerHTML = '';
    const filteredItems = filter === 'all' 
      ? items 
      : items.filter(item => item.type === filter);

    filteredItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="card-image">
          <img src="${API_BASE_URL}/uploads/images/${item.imageUrl}" alt="${item.name}" 
               onerror="this.src='images/default-item.jpg'"/>
        </div>
        <div class="card-body">
          <h3>${item.name}</h3>
          <p class="description">${item.description}</p>
          <div class="meta">
            <span class="type ${item.type}">${item.type === 'lost' ? 'Lost' : 'Found'}</span>
            <span class="location"><i class="fas fa-map-marker-alt"></i> ${item.location}</span>
            <span class="date"><i class="far fa-calendar-alt"></i> ${new Date(item.date).toLocaleDateString()}</span>
          </div>
          <div class="contact">
            <i class="fas fa-phone"></i> ${item.contact}
          </div>
        </div>
      `;
      itemsContainer.appendChild(card);
    });
  }

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadItems(btn.dataset.filter);
    });
  });

  // Show alert message
  function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${type}`;
    alertDiv.innerHTML = `
      <span>${message}</span>
      <button class="close-btn">&times;</button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      alertDiv.classList.add('fade-out');
      setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
    
    // Manual close
    alertDiv.querySelector('.close-btn').addEventListener('click', () => {
      alertDiv.remove();
    });
  }

  // Initial load
  loadItems();
});