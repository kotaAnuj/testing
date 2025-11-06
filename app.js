// ===================================
// FIELD MANAGEMENT SYSTEM - PRODUCTION CODE
// ===================================

// Global State Management
const AppState = {
  currentUser: null,
  userType: null,
  tenantId: null, // admin uid for admins; admin uid (ownerId) for agents
  fields: [],
  agents: [],
  forms: [],
  submissions: [],
  formFields: [],
  currentFieldId: null,
  currentFormId: null
};

// Remove undefined values recursively so Firestore accepts the payload
function sanitizeForFirestore(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestore);
  }
  if (value && typeof value === 'object') {
    const cleaned = {};
    Object.keys(value).forEach((k) => {
      const v = value[k];
      if (v === undefined || typeof v === 'function') return;
      cleaned[k] = sanitizeForFirestore(v);
    });
    return cleaned;
  }
  return value;
}

// App configuration
const AppConfig = {
  // Set to true only for development/testing to pre-seed sample fields/agents/forms
  seedSampleData: false
};

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  // Auto-login / restore session
  try {
    if (window.FirebaseServices && FirebaseServices.auth) {
      FirebaseServices.auth.onAuthStateChanged(async (user) => {
        if (user) {
          // Determine role (admin if users role=admin or invited)
          let isAdmin = false;
          try {
            const userDoc = await FirebaseServices.db.collection('users').doc(user.uid).get();
            isAdmin = userDoc.exists && userDoc.data().role === 'admin';
            if (!isAdmin) {
              const inviteSnap = await FirebaseServices.db.collection('adminInvites').where('email', '==', user.email).limit(1).get();
              if (!inviteSnap.empty) {
                isAdmin = true;
                await FirebaseServices.db.collection('users').doc(user.uid).set({
                  name: user.displayName || 'Administrator',
                  email: user.email,
                  role: 'admin',
                  updatedAt: new Date().toISOString()
                }, { merge: true });
              }
            }
          } catch (_) {}

          if (isAdmin) {
            AppState.userType = 'admin';
            AppState.currentUser = { uid: user.uid, email: user.email, role: 'admin', name: user.displayName || 'Administrator' };
            AppState.tenantId = user.uid;
            try { await loadDataFromFirestore(); } catch(_) {}
            showScreen('admin');
            showAdminHome();
            renderFieldsMenu();
            const sb = document.getElementById('sidebar');
            if (sb) sb.classList.add('open');
          } else {
            // Fallback to login screen for agents (no auto-login for agents by design here)
            showScreen('login');
          }
        } else {
          showScreen('login');
        }
      });
    }
  } catch (_) {}
});

async function initializeApp() {
  // Initialize with sample data only when explicitly enabled in AppConfig
  if (AppConfig.seedSampleData && AppState.fields.length === 0) {
    createSampleData();
  }

  // Load data from Firestore if available
  try {
    if (window.FirebaseServices && FirebaseServices.db) {
      await loadDataFromFirestore();
    }
  } catch (e) {
    console.warn('Failed to load data from Firestore:', e);
    try { alert('Warning: Could not load data from Firestore. Please log in and try again.'); } catch(_) {}
  }

  // Show login screen
  showScreen('login');

  // Populate agent select dropdown
  populateAgentSelect();

  // Render the fields menu so sidebar shows up-to-date data (even if empty)
  renderFieldsMenu();
}

async function loadDataFromFirestore() {
  if (!AppState.tenantId) {
    // No tenant set yet; skip to avoid leaking global data
    AppState.fields = [];
    AppState.agents = [];
    AppState.forms = [];
    AppState.submissions = [];
    return;
  }
  const db = FirebaseServices.db;
  const [fieldsSnap, agentsSnap, formsSnap, submissionsSnap] = await Promise.all([
    db.collection('fields').where('ownerId', '==', AppState.tenantId).get(),
    db.collection('agents').where('ownerId', '==', AppState.tenantId).get(),
    db.collection('forms').where('ownerId', '==', AppState.tenantId).get(),
    db.collection('submissions').where('ownerId', '==', AppState.tenantId).get()
  ]);

  AppState.fields = fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  AppState.agents = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  AppState.forms = formsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  AppState.submissions = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function createSampleData() {
  // Sample Fields
  AppState.fields = [
    {
      id: 'field_1',
      name: 'MEASUREMENTS',
      parent: null,
      description: 'Physical measurements and dimensions',
      children: [],
      createdAt: new Date().toISOString()
    },
    {
      id: 'field_2',
      name: 'SURVEYS',
      parent: null,
      description: 'Customer and market surveys',
      children: [],
      createdAt: new Date().toISOString()
    },
    {
      id: 'field_3',
      name: 'INSPECTIONS',
      parent: null,
      description: 'Quality and safety inspections',
      children: [],
      createdAt: new Date().toISOString()
    }
  ];

  // Sample Agents
  AppState.agents = [
    {
      id: 'agent_1',
      name: 'John Smith',
      agentId: 'AGT001',
      email: 'john@company.com',
      phone: '+1234567890',
      fieldId: 'field_1',
      password: 'agent123',
      createdAt: new Date().toISOString()
    },
    {
      id: 'agent_2',
      name: 'Sarah Johnson',
      agentId: 'AGT002',
      email: 'sarah@company.com',
      phone: '+1234567891',
      fieldId: 'field_2',
      password: 'agent123',
      createdAt: new Date().toISOString()
    }
  ];

  // Sample Forms
  AppState.forms = [
    {
      id: 'form_1',
      name: 'Building Measurement Form',
      fieldId: 'field_1',
      description: 'Record building dimensions and measurements',
      fields: [
        { id: 'f1', label: 'Building Name', type: 'text', required: true },
        { id: 'f2', label: 'Length (m)', type: 'number', required: true },
        { id: 'f3', label: 'Width (m)', type: 'number', required: true },
        { id: 'f4', label: 'Height (m)', type: 'number', required: true },
        { id: 'f5', label: 'Measurement Date', type: 'date', required: true },
        { id: 'f6', label: 'Notes', type: 'textarea', required: false }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'form_2',
      name: 'Customer Satisfaction Survey',
      fieldId: 'field_2',
      description: 'Collect customer feedback',
      fields: [
        { id: 'f1', label: 'Customer Name', type: 'text', required: true },
        { id: 'f2', label: 'Email', type: 'email', required: true },
        { id: 'f3', label: 'Rating', type: 'rating', required: true, max: 5 },
        { id: 'f4', label: 'Feedback', type: 'textarea', required: true }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  // Sample Submissions
  AppState.submissions = [
    {
      id: 'sub_1',
      formId: 'form_1',
      agentId: 'agent_1',
      data: {
        f1: 'Building A',
        f2: '50',
        f3: '30',
        f4: '15',
        f5: '2024-11-01',
        f6: 'All measurements verified'
      },
      submittedAt: new Date().toISOString()
    }
  ];
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
  const loginType = document.getElementById('login-type');
  if (loginType) {
    loginType.addEventListener('change', (e) => {
      const agentEmailGroup = document.getElementById('agent-email-group');
      const adminEmailGroup = document.getElementById('admin-email-group');
      
      if (e.target.value === 'agent') {
        if (agentEmailGroup) agentEmailGroup.classList.remove('hidden');
        if (adminEmailGroup) adminEmailGroup.classList.add('hidden');
      } else {
        if (agentEmailGroup) agentEmailGroup.classList.add('hidden');
        if (adminEmailGroup) adminEmailGroup.classList.remove('hidden');
      }
    });
  }

  // Enter key on password field
  const passwordInput = document.getElementById('login-password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
}
// ===================================
// PROFILE & ADMIN ACCESS
// ===================================

function openProfileModal() {
  try {
    const name = AppState.currentUser?.name || '';
    const input = document.getElementById('profile-name');
    if (input) input.value = name;
  } catch(_) {}
  const modal = new bootstrap.Modal(document.getElementById('profileModal'));
  modal.show();
}

async function saveProfile() {
  const name = (document.getElementById('profile-name')?.value || '').trim();
  if (!name) { alert('Please enter a display name'); return; }
  if (!window.FirebaseServices || !FirebaseServices.auth || !FirebaseServices.db) { alert('Firebase not ready'); return; }
  try {
    const user = FirebaseServices.auth.currentUser;
    if (!user) throw new Error('Not signed in');
    // Update auth displayName
    try { await user.updateProfile({ displayName: name }); } catch(_){ }
    // Update local state
    AppState.currentUser.name = name;
    // Update users doc
    await FirebaseServices.db.collection('users').doc(user.uid).set({
      name,
      email: user.email,
      role: 'admin',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
    alert('Profile updated');
  } catch (e) {
    alert(e && e.message ? e.message : 'Failed to update profile');
  }
}

async function grantAdminAccess() {
  const email = (document.getElementById('grant-admin-email')?.value || '').trim();
  if (!email) { alert('Enter an email to grant admin'); return; }
  if (!window.FirebaseServices || !FirebaseServices.db) { alert('Firebase not ready'); return; }
  try {
    await FirebaseServices.db.collection('adminInvites').doc(email.toLowerCase()).set({
      email: email.toLowerCase(),
      invitedBy: AppState.currentUser?.uid || null,
      invitedAt: new Date().toISOString()
    }, { merge: true });
    alert('Admin access granted. The user will become admin after login.');
  } catch (e) {
    alert(e && e.message ? e.message : 'Failed to grant admin');
  }
}


// ===================================
// AUTHENTICATION
// ===================================

async function handleLogin() {
  const loginType = document.getElementById('login-type').value;
  const password = document.getElementById('login-password').value;

  if (loginType === 'admin') {
    const emailInput = document.getElementById('admin-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) { alert('Please enter admin email'); return; }
    if (!window.FirebaseServices || !FirebaseServices.auth) {
      alert('Authentication is not available. Please check Firebase setup.');
      return;
    }
    FirebaseServices.auth.signInWithEmailAndPassword(email, password)
      .then(async (cred) => {
        let isAdmin = true;
        try {
          const userDoc = await FirebaseServices.db.collection('users').doc(cred.user.uid).get();
          isAdmin = userDoc.exists ? (userDoc.data().role === 'admin') : false;
          if (!isAdmin) {
            const inviteSnap = await FirebaseServices.db.collection('adminInvites').where('email', '==', cred.user.email).limit(1).get();
            if (!inviteSnap.empty) {
              isAdmin = true;
              await FirebaseServices.db.collection('users').doc(cred.user.uid).set({
                name: cred.user.displayName || 'Administrator',
                email: cred.user.email,
                role: 'admin',
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }
        } catch (_) {}
        if (!isAdmin) {
          await FirebaseServices.auth.signOut();
          alert('This account does not have admin access.');
          return;
        }
        AppState.userType = 'admin';
        AppState.currentUser = { uid: cred.user.uid, email: cred.user.email, role: 'admin', name: cred.user.displayName || 'Administrator' };
        AppState.tenantId = cred.user.uid;
        try { await loadDataFromFirestore(); } catch (e) { console.warn('Reload after admin login failed', e); }
        showScreen('admin');
        showAdminHome();
        renderFieldsMenu();
        const sb = document.getElementById('sidebar');
        if (sb) sb.classList.add('open');
      })
      .catch((err) => {
        alert(err && err.message ? err.message : 'Admin login failed');
      });
  } else {
    // AGENT LOGIN WITH EMAIL/PASSWORD
    const agentEmail = document.getElementById('agent-email');
    const email = agentEmail ? agentEmail.value.trim() : '';
    
    if (!email) {
      alert('Please enter your agent email');
      return;
    }
    
    if (!password) {
      alert('Please enter your password');
      return;
    }

    if (!window.FirebaseServices || !FirebaseServices.db) {
      alert('Database connection not available');
      return;
    }

    try {
      // Find agent by email
      const agentsSnapshot = await FirebaseServices.db.collection('agents')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();
      
      if (agentsSnapshot.empty) {
        alert('No agent found with this email address');
        return;
      }

      const agentDoc = agentsSnapshot.docs[0];
      const agentData = agentDoc.data();
      const selectedAgent = { id: agentDoc.id, ...agentData };

      // Verify password
      if (password !== selectedAgent.password) {
        alert('Invalid password');
        return;
      }

      // Successful agent login
      AppState.userType = 'agent';
      AppState.currentUser = selectedAgent;
      AppState.tenantId = selectedAgent.ownerId || null;
      
      // Load data for this agent's tenant
      try { 
        if (window.FirebaseServices && FirebaseServices.db) { 
          await loadDataFromFirestore(); 
        } 
      } catch(_) {}
      
      showScreen('agent');
      document.getElementById('agent-name-display').textContent = selectedAgent.name;
      showAgentForms();
      
      // Open agent sidebar
      const asb = document.getElementById('agent-sidebar');
      if (asb) asb.classList.add('open');
      
    } catch (error) {
      console.error('Agent login error:', error);
      alert('Login failed. Please try again.');
    }
  }
}

function logout() {
  const doReset = () => {
    AppState.currentUser = null;
    AppState.userType = null;
    AppState.tenantId = null;
    const pwd = document.getElementById('login-password');
    if (pwd) pwd.value = 'admin123';
    showScreen('login');
  };
  try {
    if (AppState.userType === 'admin' && window.FirebaseServices && FirebaseServices.auth) {
      FirebaseServices.auth.signOut().finally(doReset);
      return;
    }
  } catch (_) {}
  doReset();
}

function populateAgentSelect() {
  const select = document.getElementById('agent-select');
  if (!select) return;

  select.innerHTML = '<option value="">-- Select Agent --</option>';
  AppState.agents.forEach(agent => {
    const option = document.createElement('option');
    option.value = agent.id;
    option.textContent = `${agent.name} (${agent.agentId})`;
    select.appendChild(option);
  });
}

// ===================================
// SCREEN MANAGEMENT
// ===================================

function showScreen(screen) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-screen').classList.add('hidden');
  document.getElementById('agent-screen').classList.add('hidden');

  if (screen === 'login') {
    document.getElementById('login-screen').classList.remove('hidden');
  } else if (screen === 'admin') {
    document.getElementById('admin-screen').classList.remove('hidden');
  } else if (screen === 'agent') {
    document.getElementById('agent-screen').classList.remove('hidden');
  }
}

function toggleSidebar() {
  // Choose the sidebar that belongs to the currently visible screen.
  const adminScreen = document.getElementById('admin-screen');
  const agentScreen = document.getElementById('agent-screen');

  let sidebar = null;
  if (adminScreen && !adminScreen.classList.contains('hidden')) {
    sidebar = document.getElementById('sidebar');
  } else if (agentScreen && !agentScreen.classList.contains('hidden')) {
    sidebar = document.getElementById('agent-sidebar');
  } else {
    // Fallback to whichever exists
    sidebar = document.getElementById('sidebar') || document.getElementById('agent-sidebar');
  }

  if (sidebar) sidebar.classList.toggle('open');
}

// ===================================
// ADMIN FUNCTIONS
// ===================================

function showAdminHome() {
  setActiveMenu('admin', 0);
  
  // Only show root-level fields (parent === null) on the admin home page
  const rootFields = AppState.fields.filter(f => f.parent === null);
  const totalFields = AppState.fields.length;
  const totalAgents = AppState.agents.length;
  const totalForms = AppState.forms.length;
  const totalSubmissions = AppState.submissions.length;

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-home me-2"></i>Dashboard Overview</h4>
    </div>

    <div class="stat-boxes">
      <div class="stat-box">
        <i class="fas fa-folder-open stat-icon"></i>
        <div class="stat-label">Total Fields</div>
        <div class="stat-value">${totalFields}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-users stat-icon"></i>
        <div class="stat-label">Total Agents</div>
        <div class="stat-value">${totalAgents}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-file-alt stat-icon"></i>
        <div class="stat-label">Total Forms</div>
        <div class="stat-value">${totalForms}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-check-circle stat-icon"></i>
        <div class="stat-label">Total Submissions</div>
        <div class="stat-value">${totalSubmissions}</div>
      </div>
    </div>

    <div class="field-grid">
      ${rootFields.map(field => {
        const fieldForms = AppState.forms.filter(f => f.fieldId === field.id);
        const fieldAgents = AppState.agents.filter(a => a.fieldId === field.id);
        const fieldSubmissions = AppState.submissions.filter(s => {
          const form = AppState.forms.find(f => f.id === s.formId);
          return form && form.fieldId === field.id;
        });

        return `
          <div class="field-card" onclick="showFieldDetail('${field.id}')">
            <div class="field-card-title">
              <i class="fas fa-folder me-2"></i>${field.name}
            </div>
            <div class="mb-3 text-muted small">${field.description || 'No description'}</div>
            <div class="d-flex justify-content-between text-muted small">
              <span><i class="fas fa-file-alt me-1"></i>${fieldForms.length} Forms</span>
              <span><i class="fas fa-users me-1"></i>${fieldAgents.length} Agents</span>
              <span><i class="fas fa-check me-1"></i>${fieldSubmissions.length} Submissions</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="chart-container">
      <h5 class="chart-title">Submissions Over Time</h5>
      <div class="chart-wrapper" id="submissions-chart"></div>
    </div>
  `;

  document.getElementById('admin-content').innerHTML = content;
  renderSubmissionsChart();
}

function renderFieldsMenu() {
  const menu = document.getElementById('fields-menu');
  if (!menu) return;
  menu.innerHTML = '';

  // Recursive builder: returns a <ul> element (or null) for the given parentId
  function buildList(parentId) {
    const items = AppState.fields.filter(f => f.parent === parentId);
    if (!items || items.length === 0) return null;

    const ul = document.createElement('ul');
    ul.className = parentId === null ? 'fields-root' : 'fields-nested';

    items.forEach(field => {
      const li = document.createElement('li');
      li.className = 'menu-item field-item';
  li.setAttribute('data-field-id', field.id);

      // Create a container so we can separate toggle vs selection
      const container = document.createElement('div');
      container.className = 'field-container d-flex align-items-center';

      const icon = document.createElement('i');
      icon.className = 'fas fa-folder me-2';
      container.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = field.name;
      label.style.cursor = 'pointer';
      container.appendChild(label);

      li.appendChild(container);

      // Attach selection behaviour: show details when label is clicked
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        showFieldDetail(field.id);
      });

      // If this field has children, build nested list and add toggle behaviour
      const childUl = buildList(field.id);
      if (childUl) {
        li.classList.add('has-children');

        // Create a small toggle icon
          // Create a small toggle icon (uses .expand-arrow class from CSS)
          const toggle = document.createElement('button');
          toggle.className = 'btn btn-sm btn-toggle ms-auto';
          toggle.style.border = 'none';
          toggle.style.background = 'transparent';
          toggle.style.cursor = 'pointer';
          toggle.innerHTML = `<i class="fas fa-chevron-down expand-arrow"></i>`;
          // Append toggle to the container (right side)
          container.appendChild(toggle);

          // By default collapse children
          childUl.style.display = 'none';

          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = childUl.style.display === 'none';
            childUl.style.display = isHidden ? 'block' : 'none';
            const arrow = toggle.querySelector('.expand-arrow');
            if (arrow) arrow.classList.toggle('open', !isHidden);
          });

        li.appendChild(childUl);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  // Build the tree starting from root (parent === null)
  const root = buildList(null);
  if (root) {
    // Move root <li> children directly into the #fields-menu so styles targeting
    // `.menu-list > .menu-item` work as expected (avoid nested top-level <ul>)
    // If there are no root-level items, show a friendly empty state message
    if (!root.firstChild) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'menu-item text-muted';
      emptyLi.textContent = 'No fields. Click Add New Field';
      menu.appendChild(emptyLi);
    } else {
      while (root.firstChild) {
        menu.appendChild(root.firstChild);
      }
    }
  }

  // Add "Add New Field" entry at the bottom
  const addLi = document.createElement('li');
  addLi.className = 'menu-item add-field';
  addLi.innerHTML = `<i class="fas fa-plus-circle me-2"></i><span>Add New Field</span>`;
  addLi.addEventListener('click', (e) => { e.stopPropagation(); openFieldModal(); });
  menu.appendChild(addLi);
}

// Expand a field in the sidebar (and its ancestors) so the target child becomes visible
function expandMenuForField(fieldId) {
  if (!fieldId) return;

  // Expand ancestors first
  const field = AppState.fields.find(f => f.id === fieldId);
  if (!field) return;

  if (field.parent) {
    expandMenuForField(field.parent);
  }

  const el = document.querySelector(`[data-field-id="${fieldId}"]`);
  if (!el) return;

  const childUl = el.querySelector('ul');
  const arrow = el.querySelector('.expand-arrow');
  if (childUl) {
    childUl.style.display = 'block';
    if (arrow) arrow.classList.add('open');
  }
}

function showFieldDetail(fieldId) {
  AppState.currentFieldId = fieldId;
  const field = AppState.fields.find(f => f.id === fieldId);
  if (!field) return;

  const subfields = AppState.fields.filter(f => f.parent === fieldId);
  const fieldForms = AppState.forms.filter(f => f.fieldId === fieldId);
  const fieldAgents = AppState.agents.filter(a => a.fieldId === fieldId);
  const fieldSubmissions = AppState.submissions.filter(s => {
    const form = AppState.forms.find(f => f.id === s.formId);
    return form && form.fieldId === fieldId;
  });

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-folder me-2"></i>${field.name}</h4>
      <div class="ms-auto d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm" onclick="openEditFieldModal('${fieldId}')">
          <i class="fas fa-edit me-2"></i>Edit Field
        </button>
        <button class="btn btn-success btn-sm" onclick="openFormModal('${fieldId}')">
          <i class="fas fa-plus me-2"></i>Create Form
        </button>
        <button class="btn btn-primary btn-sm" onclick="openAgentModal('${fieldId}')">
          <i class="fas fa-user-plus me-2"></i>Add Agent
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteField('${fieldId}')">
          <i class="fas fa-trash me-2"></i>Delete Field
        </button>
      </div>
    </div>

    <div class="stat-boxes">
      <div class="stat-box">
        <i class="fas fa-file-alt stat-icon"></i>
        <div class="stat-label">Forms</div>
        <div class="stat-value">${fieldForms.length}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-users stat-icon"></i>
        <div class="stat-label">Agents</div>
        <div class="stat-value">${fieldAgents.length}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-check-circle stat-icon"></i>
        <div class="stat-label">Submissions</div>
        <div class="stat-value">${fieldSubmissions.length}</div>
      </div>
      <div class="stat-box">
        <i class="fas fa-sitemap stat-icon"></i>
        <div class="stat-label">Subfields</div>
        <div class="stat-value">${subfields.length}</div>
      </div>
    </div>

    <div class="row">
      <div class="col-md-6">
        <div class="form-card">
          <h5 class="mb-3"><i class="fas fa-file-alt me-2"></i>Forms in this Field</h5>
          ${fieldForms.length === 0 ? '<p class="text-muted">No forms created yet</p>' : `
            <div class="list-group">
              ${fieldForms.map(form => `
                <a href="#" class="list-group-item list-group-item-action" onclick="showFormDetail('${form.id}'); return false;">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>${form.name}</strong>
                      <p class="mb-0 small text-muted">${form.description || ''}</p>
                    </div>
                    <span class="badge bg-primary">${form.fields.length} fields</span>
                  </div>
                </a>
              `).join('')}
            </div>
          `}
        </div>
      </div>
      <div class="col-md-6">
        <div class="form-card">
          <h5 class="mb-3"><i class="fas fa-users me-2"></i>Agents in this Field</h5>
          ${fieldAgents.length === 0 ? '<p class="text-muted">No agents assigned yet</p>' : `
            <div class="list-group">
              ${fieldAgents.map(agent => `
                <div class="list-group-item">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>${agent.name}</strong>
                      <p class="mb-0 small text-muted">${agent.agentId} • ${agent.email || ''}</p>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteAgent('${agent.id}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    </div>

    <div class="row mt-3">
      <div class="col-12">
        <div class="form-card">
          <h5 class="mb-3"><i class="fas fa-sitemap me-2"></i>Subfields</h5>
          ${subfields.length === 0 ? '<p class="text-muted">No subfields</p>' : `
            <div class="list-group">
              ${subfields.map(sf => `
                <a href="#" class="list-group-item list-group-item-action" onclick="showFieldDetail('${sf.id}'); return false;">
                  <div class="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>${sf.name}</strong>
                      <p class="mb-0 small text-muted">${sf.description || ''}</p>
                    </div>
                    <span class="badge bg-secondary">${AppState.forms.filter(f=>f.fieldId===sf.id).length} forms</span>
                  </div>
                </a>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  document.getElementById('admin-content').innerHTML = content;
}

function showFormDetail(formId) {
  AppState.currentFormId = formId;
  const form = AppState.forms.find(f => f.id === formId);
  if (!form) return;

  const formSubmissions = AppState.submissions.filter(s => s.formId === formId);
  
  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-file-alt me-2"></i>${form.name}</h4>
      <div class="ms-auto d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm" onclick="exportFormData('${formId}')">
          <i class="fas fa-download me-2"></i>Export
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteForm('${formId}')">
          <i class="fas fa-trash me-2"></i>Delete
        </button>
      </div>
    </div>

    <div class="form-card">
      <h5><i class="fas fa-info-circle me-2"></i>Form Details</h5>
      <p class="text-muted">${form.description || 'No description'}</p>
      <div class="mt-3">
        <strong>Total Fields:</strong> ${form.fields.length}<br>
        <strong>Total Submissions:</strong> ${formSubmissions.length}
      </div>
    </div>

    <div class="form-card">
      <h5 class="mb-3"><i class="fas fa-list me-2"></i>Form Fields (${form.fields.length})</h5>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
            </tr>
          </thead>
          <tbody>
            ${form.fields.map(field => `
              <tr>
                <td><strong>${field.label}</strong></td>
                <td><span class="badge bg-secondary">${field.type}</span></td>
                <td>${field.required ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-muted"></i>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="spreadsheet-container">
      <div class="spreadsheet-toolbar">
        <h5 class="mb-0"><i class="fas fa-table me-2"></i>Form Submissions (${formSubmissions.length})</h5>
      </div>
      ${formSubmissions.length === 0 ? 
        '<div class="p-4 text-center text-muted">No submissions yet</div>' :
        `<div style="overflow-x: auto;">
          <table class="spreadsheet-table">
            <thead>
              <tr>
                <th>Submission ID</th>
                <th>Agent</th>
                <th>Submitted At</th>
                ${form.fields.map(f => `<th>${f.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${formSubmissions.map(sub => {
                const agent = AppState.agents.find(a => a.id === sub.agentId);
                return `
                  <tr>
                    <td>${sub.id}</td>
                    <td>${agent ? agent.name : 'Unknown'}</td>
                    <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                    ${form.fields.map(f => `<td>${sub.data[f.id] || '-'}</td>`).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`
      }
    </div>
  `;

  document.getElementById('admin-content').innerHTML = content;
}

function showAllForms() {
  setActiveMenu('admin', 1);

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-file-alt me-2"></i>All Forms</h4>
      <button class="btn btn-success btn-sm ms-auto" onclick="openFormModal()">
        <i class="fas fa-plus me-2"></i>Create New Form
      </button>
    </div>

    <div class="field-grid">
      ${AppState.forms.map(form => {
        const field = AppState.fields.find(f => f.id === form.fieldId);
        const submissions = AppState.submissions.filter(s => s.formId === form.id);
        
        return `
          <div class="field-card" onclick="showFormDetail('${form.id}')">
            <div class="field-card-title">${form.name}</div>
            <div class="mb-3 text-muted small">${form.description || 'No description'}</div>
            <div class="d-flex justify-content-between text-muted small">
              <span><i class="fas fa-folder me-1"></i>${field ? field.name : 'Unknown Field'}</span>
              <span><i class="fas fa-list me-1"></i>${form.fields.length} Fields</span>
              <span><i class="fas fa-check me-1"></i>${submissions.length} Submissions</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById('admin-content').innerHTML = content;
}

function showAllAgents() {
  setActiveMenu('admin', 2);

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-users me-2"></i>All Agents</h4>
      <button class="btn btn-success btn-sm ms-auto" onclick="openAgentModal()">
        <i class="fas fa-user-plus me-2"></i>Add New Agent
      </button>
    </div>

    <div class="form-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Agent ID</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Assigned Field</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${AppState.agents.map(agent => {
              const field = AppState.fields.find(f => f.id === agent.fieldId);
              return `
                <tr>
                  <td><strong>${agent.name}</strong></td>
                  <td>${agent.agentId}</td>
                  <td>${agent.email || '-'}</td>
                  <td>${agent.phone || '-'}</td>
                  <td><span class="badge bg-primary">${field ? field.name : 'Unknown'}</span></td>
                  <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteAgent('${agent.id}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('admin-content').innerHTML = content;
}

// ===================================
// AGENT FUNCTIONS
// ===================================

function showAgentForms() {
  setActiveMenu('agent', 0);
  
  const agentForms = AppState.forms.filter(f => f.fieldId === AppState.currentUser.fieldId);

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-clipboard-list me-2"></i>My Forms</h4>
    </div>

    ${agentForms.length === 0 ? 
      '<div class="form-card text-center"><p class="text-muted">No forms assigned to your field yet</p></div>' :
      `<div class="field-grid">
        ${agentForms.map(form => {
          const submissions = AppState.submissions.filter(s => 
            s.formId === form.id && s.agentId === AppState.currentUser.id
          );
          
          return `
            <div class="field-card" onclick="showAgentFormFill('${form.id}')">
              <div class="field-card-title">${form.name}</div>
              <div class="mb-3 text-muted small">${form.description || 'No description'}</div>
              <div class="d-flex justify-content-between text-muted small">
                <span><i class="fas fa-list me-1"></i>${form.fields.length} Fields</span>
                <span><i class="fas fa-check me-1"></i>${submissions.length} My Submissions</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>`
    }
  `;

  document.getElementById('agent-content').innerHTML = content;
}

function showAgentFormFill(formId) {
  const form = AppState.forms.find(f => f.id === formId);
  if (!form) return;

  const content = `
    <div class="top-bar">
      <button class="btn btn-outline-primary btn-sm" onclick="showAgentForms()">
        <i class="fas fa-arrow-left me-2"></i>Back
      </button>
      <h4 class="mb-0 ms-3"><i class="fas fa-file-alt me-2"></i>${form.name}</h4>
    </div>

    <div class="form-card">
      <form id="agent-submission-form" onsubmit="submitAgentForm('${formId}', false); return false;">
        ${form.fields.map(field => renderFormField(field)).join('')}
        
        <div class="mt-4">
          <button type="submit" class="btn btn-success">
            <i class="fas fa-check me-2"></i>Submit Form
          </button>
          <button type="button" class="btn btn-warning ms-2" onclick="submitAgentForm('${formId}', true)">
            <i class="fas fa-save me-2"></i>Save as Draft
          </button>
          <button type="button" class="btn btn-secondary ms-2" onclick="showAgentForms()">
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('agent-content').innerHTML = content;
}

function renderFormField(field) {
  const required = field.required ? 'required' : '';
  const requiredLabel = field.required ? '<span class="text-danger">*</span>' : '';
  const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : '';

  // Section Title (not an input field)
  if (field.type === 'section') {
    return `
      <div class="mb-4 mt-4">
        <h5 class="border-bottom pb-2">${field.label}</h5>
        ${field.sectionText ? `<p class="text-muted small">${field.sectionText}</p>` : ''}
      </div>
    `;
  }

  switch (field.type) {
    case 'text':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="text" name="${field.id}" class="form-control" ${required} ${placeholder}>
        </div>
      `;
    
    case 'email':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="email" name="${field.id}" class="form-control" ${required} ${placeholder}>
          <small class="text-muted">Must be a valid email address</small>
        </div>
      `;
    
    case 'phone':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="tel" name="${field.id}" class="form-control" ${required} ${placeholder} 
            pattern="[0-9+\\-\\s\\(\\)]*" title="Please enter a valid phone number">
        </div>
      `;
    
    case 'number':
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      const max = field.maxValue !== undefined ? `max="${field.maxValue}"` : '';
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="number" name="${field.id}" class="form-control" ${required} ${placeholder} ${min} ${max}>
          ${field.min !== undefined || field.maxValue !== undefined ? 
            `<small class="text-muted">
              ${field.min !== undefined ? `Min: ${field.min}` : ''} 
              ${field.min !== undefined && field.maxValue !== undefined ? ' • ' : ''}
              ${field.maxValue !== undefined ? `Max: ${field.maxValue}` : ''}
            </small>` : ''}
        </div>
      `;
    
    case 'date':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="date" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
    
    case 'time':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="time" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
    
    case 'textarea':
      const minlength = field.minLength ? `minlength="${field.minLength}"` : '';
      const maxlength = field.maxLength ? `maxlength="${field.maxLength}"` : '';
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <textarea name="${field.id}" class="form-control" rows="4" ${required} ${placeholder} ${minlength} ${maxlength}></textarea>
          ${field.minLength || field.maxLength ? 
            `<small class="text-muted">
              ${field.minLength ? `Min: ${field.minLength} characters` : ''} 
              ${field.minLength && field.maxLength ? ' • ' : ''}
              ${field.maxLength ? `Max: ${field.maxLength} characters` : ''}
            </small>` : ''}
        </div>
      `;
    
    case 'select':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <select name="${field.id}" class="form-select" ${required}>
            <option value="">-- Select an option --</option>
            ${(field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        </div>
      `;
    
    case 'multiselect':
      return `
        <div class="mb-3">
          <label class="form-label d-block">${field.label} ${requiredLabel}</label>
          <div class="border rounded p-3" style="max-height: 250px; overflow-y: auto;">
            ${(field.options || []).map((opt, i) => `
              <div class="form-check">
                <input class="form-check-input multiselect-option" type="checkbox" 
                  name="${field.id}[]" id="${field.id}_${i}" value="${opt}">
                <label class="form-check-label" for="${field.id}_${i}">${opt}</label>
              </div>
            `).join('')}
          </div>
          <small class="text-muted">Select all that apply</small>
        </div>
      `;
    
    case 'radio':
      return `
        <div class="mb-3">
          <label class="form-label d-block">${field.label} ${requiredLabel}</label>
          ${(field.options || []).map((opt, i) => `
            <div class="form-check">
              <input class="form-check-input" type="radio" name="${field.id}" 
                id="${field.id}_${i}" value="${opt}" ${required}>
              <label class="form-check-label" for="${field.id}_${i}">${opt}</label>
            </div>
          `).join('')}
        </div>
      `;
    
    case 'checkbox':
      return `
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" name="${field.id}" 
              id="${field.id}" ${required}>
            <label class="form-check-label" for="${field.id}">
              ${field.label} ${requiredLabel}
            </label>
          </div>
        </div>
      `;
    
    case 'rating':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <div class="rating-container">
            ${Array.from({length: field.max || 5}, (_, i) => `
              <label class="rating-star">
                <input type="radio" name="${field.id}" value="${i + 1}" ${required}>
                <i class="fas fa-star"></i>
              </label>
            `).join('')}
          </div>
          <small class="text-muted">Rate from 1 to ${field.max || 5}</small>
        </div>
      `;
    
    case 'file':
      const accept = field.accept ? `accept="${field.accept}"` : '';
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="file" name="${field.id}" class="form-control" ${required} ${accept}>
          ${field.accept ? `<small class="text-muted">Accepted: ${field.accept}</small>` : ''}
        </div>
      `;
    
    default:
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="text" name="${field.id}" class="form-control" ${required} ${placeholder}>
        </div>
      `;
  }
}

function submitAgentForm(formId, isDraft = false) {
  const form = document.getElementById('agent-submission-form');
  const formElement = AppState.forms.find(f => f.id === formId);
  
  if (!isDraft) {
    // Validate required fields
    const requiredFields = formElement.fields.filter(f => f.required && f.type !== 'section');
    let isValid = true;
    let firstInvalidField = null;

    for (const field of requiredFields) {
      const input = form.elements[field.id];
      
      if (!input) continue;

      // Handle different input types
      if (field.type === 'checkbox') {
        if (!input.checked) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = input;
        }
      } else if (field.type === 'radio') {
        const selected = form.querySelector(`input[name="${field.id}"]:checked`);
        if (!selected) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = input;
        }
      } else if (field.type === 'multiselect') {
        const checked = form.querySelectorAll(`input[name="${field.id}[]"]:checked`);
        if (checked.length === 0) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = input;
        }
      } else {
        if (!input.value || input.value.trim() === '') {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = input;
        }
      }
    }

    if (!isValid) {
      alert('Please fill in all required fields before submitting.');
      if (firstInvalidField) {
        firstInvalidField.focus();
        firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
  }

  // Collect form data
  const formData = new FormData(form);
  const data = {};

  // Handle regular inputs
  for (let [key, value] of formData.entries()) {
    if (key.endsWith('[]')) {
      // Multiselect
      const cleanKey = key.replace('[]', '');
      if (!data[cleanKey]) data[cleanKey] = [];
      data[cleanKey].push(value);
    } else {
      data[key] = value;
    }
  }

  // Handle unchecked checkboxes
  formElement.fields.forEach(field => {
    if (field.type === 'checkbox' && data[field.id] === undefined) {
      data[field.id] = 'false';
    }
  });

  const submission = {
    id: `sub_${Date.now()}`,
    formId: formId,
    agentId: AppState.currentUser.id,
    data: data,
    ownerId: AppState.tenantId || null,
    submittedAt: new Date().toISOString(),
    status: isDraft ? 'draft' : 'submitted'
  };

  AppState.submissions.push(submission);
  
  // Persist to Firestore
  if (window.FirebaseServices && FirebaseServices.db) {
    FirebaseServices.db.collection('submissions').doc(submission.id)
      .set(sanitizeForFirestore(submission))
      .catch(() => {});
  }
  
  alert(isDraft ? 'Form saved as draft!' : 'Form submitted successfully!');
  showAgentForms();
}

function showAgentSubmissions() {
  setActiveMenu('agent', 1);
  
  const mySubmissions = AppState.submissions.filter(s => s.agentId === AppState.currentUser.id);

  const content = `
    <div class="top-bar">
      <h4 class="mb-0"><i class="fas fa-check-circle me-2"></i>My Submissions</h4>
    </div>

    ${mySubmissions.length === 0 ? 
      '<div class="form-card text-center"><p class="text-muted">No submissions yet</p></div>' :
      `<div class="form-card">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Submission ID</th>
                <th>Form Name</th>
                <th>Submitted At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${mySubmissions.map(sub => {
                const form = AppState.forms.find(f => f.id === sub.formId);
                return `
                  <tr>
                    <td>${sub.id}</td>
                    <td><strong>${form ? form.name : 'Unknown Form'}</strong></td>
                    <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                    <td>
                      <button class="btn btn-sm btn-outline-primary" onclick="viewSubmissionDetail('${sub.id}')">
                        <i class="fas fa-eye me-1"></i>View
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`
    }
  `;

  document.getElementById('agent-content').innerHTML = content;
}

function viewSubmissionDetail(submissionId) {
  const submission = AppState.submissions.find(s => s.id === submissionId);
  if (!submission) return;

  const form = AppState.forms.find(f => f.id === submission.formId);
  if (!form) return;

  const content = `
    <div class="top-bar">
      <button class="btn btn-outline-primary btn-sm" onclick="showAgentSubmissions()">
        <i class="fas fa-arrow-left me-2"></i>Back
      </button>
      <h4 class="mb-0 ms-3"><i class="fas fa-file-alt me-2"></i>Submission Details</h4>
    </div>

    <div class="form-card">
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 class="mb-2">${form.name}</h5>
          <p class="text-muted mb-0">
            <i class="fas fa-clock me-2"></i>Submitted: ${new Date(submission.submittedAt).toLocaleString()}
          </p>
          ${submission.status === 'draft' ? 
            '<span class="badge bg-warning mt-2">Draft</span>' : 
            '<span class="badge bg-success mt-2">Submitted</span>'}
        </div>
      </div>
      
      <hr>
      
      <table class="table table-striped">
        <tbody>
          ${form.fields.map(field => {
            if (field.type === 'section') {
              return `
                <tr class="table-active">
                  <th colspan="2" class="h6 py-3">
                    <i class="fas fa-heading me-2"></i>${field.label}
                  </th>
                </tr>
              `;
            }
            
            let displayValue = submission.data[field.id] || '-';
            
            // Handle different field types
            if (field.type === 'multiselect' && Array.isArray(submission.data[field.id])) {
              displayValue = submission.data[field.id].join(', ');
            } else if (field.type === 'checkbox') {
              displayValue = submission.data[field.id] === 'on' || submission.data[field.id] === true 
                ? '<i class="fas fa-check-circle text-success"></i> Yes' 
                : '<i class="fas fa-times-circle text-muted"></i> No';
            } else if (field.type === 'rating') {
              const rating = parseInt(submission.data[field.id]) || 0;
              displayValue = '⭐'.repeat(rating) + '☆'.repeat((field.max || 5) - rating) + ` (${rating}/${field.max || 5})`;
            } else if (field.type === 'file') {
              displayValue = submission.data[field.id] 
                ? `<i class="fas fa-file me-2"></i>${submission.data[field.id]}` 
                : '-';
            }
            
            return `
              <tr>
                <th style="width: 35%">${field.label}</th>
                <td>${displayValue}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('agent-content').innerHTML = content;
}

// ===================================
// MODAL FUNCTIONS
// ===================================

// ✅ Corrected openFieldModal() — uses Bootstrap safely
// ✅ SINGLE openFieldModal function - properly handles Bootstrap modals
function openFieldModal() {
  // Clean up any leftover backdrops first
  document.querySelectorAll('.modal-backdrop fade show').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  
  // Reset form fields
  const nameEl = document.getElementById('new-field-name');
  const descEl = document.getElementById('new-field-desc');
  const parentEl = document.getElementById('new-field-parent');

  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
  if (parentEl) parentEl.value = '';

  // Rebuild parent dropdown
  try { 
    populateFieldParentSelect(); 
  } catch (e) { 
    console.warn('populateFieldParentSelect missing', e); 
  }

  // Get modal element
  const modalEl = document.getElementById('fieldModal');
  if (!modalEl) {
    console.error('Modal element not found!');
    return;
  }

  // Reset modal title and button for create mode
  modalEl.removeAttribute('data-edit-id');
  const modalTitle = modalEl.querySelector('.modal-title');
  const submitBtn = modalEl.querySelector('.modal-footer .btn-primary');
  if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-folder-plus me-2"></i>Create New Field';
  if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-check me-2"></i>Create Field';

  // Use Bootstrap's modal API
  if (window.bootstrap && bootstrap.Modal) {
    // Dispose any existing instance first
    const existing = bootstrap.Modal.getInstance(modalEl);
    if (existing) {
      existing.dispose();
    }

    // Create new modal instance
    const bsModal = new bootstrap.Modal(modalEl, {
      backdrop: true,
      keyboard: true,
      focus: true
    });

    // Focus on name field when modal is shown
    modalEl.addEventListener('shown.bs.modal', function handler() {
      if (nameEl) nameEl.focus();
      modalEl.removeEventListener('shown.bs.modal', handler);
    });

    bsModal.show();
  } else {
    console.warn('Bootstrap not loaded');
    alert('Modal system not available. Please refresh the page.');
  }
}



function populateFieldParentSelect(excludeFieldId = null) {
  const select = document.getElementById('new-field-parent');
  select.innerHTML = '<option value="">-- Root Level --</option>';
  
  // Get all descendants of the field being edited (to prevent circular references)
  const getDescendants = (fieldId) => {
    const descendants = [fieldId];
    const children = AppState.fields.filter(f => f.parent === fieldId);
    children.forEach(child => {
      descendants.push(...getDescendants(child.id));
    });
    return descendants;
  };

  const excludedIds = excludeFieldId ? getDescendants(excludeFieldId) : [];
  
  // Recursive function to build hierarchical options
  function addFieldOptions(parentId = null, level = 0) {
    const fields = AppState.fields
      .filter(f => f.parent === parentId && !excludedIds.includes(f.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    fields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.id;
      const indent = '　'.repeat(level); // Unicode space for indentation
      option.textContent = `${indent}${field.name}`;
      select.appendChild(option);
      
      // Recursively add children
      addFieldOptions(field.id, level + 1);
    });
  }
  
  // Build the hierarchical list
  addFieldOptions();
}





function closeFieldModal() {
  const modal = document.getElementById('fieldModal');
  
  if (!modal) return;

  try {
    // Try Bootstrap 5 method first
    const bsModal = bootstrap.Modal.getInstance(modal);
    if (bsModal) {
      bsModal.hide();
    } else {
      // If no Bootstrap instance, close manually
      manualCloseModal(modal);
    }
  } catch (error) {
    console.error('Error closing modal:', error);
    // Fallback to manual close
    manualCloseModal(modal);
  }

  // Reset form fields
  document.getElementById('new-field-name').value = '';
  document.getElementById('new-field-desc').value = '';
  document.getElementById('new-field-parent').value = '';
  
  // Reset modal to create mode
  modal.removeAttribute('data-edit-id');
  document.querySelector('#fieldModal .modal-title').innerHTML = '<i class="fas fa-folder-plus me-2"></i>Create New Field';
  document.querySelector('#fieldModal .btn-primary').innerHTML = '<i class="fas fa-check me-2"></i>Create Field';
  
  // Remove any validation error messages
  const existingAlert = modal.querySelector('.alert');
  if (existingAlert) existingAlert.remove();
}

// ✅ Safe manual close for Bootstrap modal
function manualCloseModal(modal) {
  if (!modal) return;

  // Hide modal
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  modal.removeAttribute('aria-modal');

  // ✅ Remove ALL backdrops (sometimes more than one)
  document.querySelectorAll('.modal-backdrop fade show').forEach(b => b.remove());

  // ✅ Remove modal-open and reset scroll lock
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  // ✅ If Bootstrap modal instance exists, hide it properly too
  if (window.bootstrap && bootstrap.Modal) {
    const instance = bootstrap.Modal.getInstance(modal);
    if (instance) instance.hide();
  }
}






function createField() {
  const name = document.getElementById('new-field-name').value.trim();
  const parent = document.getElementById('new-field-parent').value;
  const description = document.getElementById('new-field-desc').value.trim();
  const modal = document.getElementById('fieldModal');
  const editId = modal.getAttribute('data-edit-id');

  // Validation: Check if name is provided
  if (!name) {
    alert('Please enter a field name');
    document.getElementById('new-field-name').focus();
    return;
  }

  // Validation: Check for duplicate field names (optional but recommended)
  const isDuplicate = AppState.fields.some(f => 
    f.name.toLowerCase() === name.toLowerCase() && f.id !== editId
  );
  
  if (isDuplicate) {
    alert('A field with this name already exists. Please choose a different name.');
    document.getElementById('new-field-name').focus();
    return;
  }

  // Validation: Prevent circular parent-child relationship
  if (editId && parent === editId) {
    alert('A field cannot be its own parent. Please select a different parent.');
    return;
  }

  // Check if we're in edit mode or create mode
  if (editId) {
    // ===================================
    // EDIT EXISTING FIELD
    // ===================================
    const field = AppState.fields.find(f => f.id === editId);
    
    if (!field) {
      alert('Field not found. Please try again.');
      closeFieldModal();
      return;
    }

    // Store old parent for updating children arrays
    const oldParent = field.parent;

    // Update field properties
    field.name = name;
    field.description = description;
    
    // Handle parent change
    if (oldParent !== parent) {
      // Remove from old parent's children array
      if (oldParent) {
        const oldParentField = AppState.fields.find(f => f.id === oldParent);
        if (oldParentField && oldParentField.children) {
          const index = oldParentField.children.indexOf(field.id);
          if (index > -1) {
            oldParentField.children.splice(index, 1);
          }
          
          // Update old parent in Firestore
          if (window.FirebaseServices && FirebaseServices.db) {
            FirebaseServices.db.collection('fields').doc(oldParentField.id)
              .set(sanitizeForFirestore(oldParentField))
              .catch(err => console.error('Error updating old parent:', err));
          }
        }
      }
      
      // Add to new parent's children array
      if (parent) {
        const newParentField = AppState.fields.find(f => f.id === parent);
        if (newParentField) {
          if (!newParentField.children) {
            newParentField.children = [];
          }
          if (!newParentField.children.includes(field.id)) {
            newParentField.children.push(field.id);
          }
          
          // Update new parent in Firestore
          if (window.FirebaseServices && FirebaseServices.db) {
            FirebaseServices.db.collection('fields').doc(newParentField.id)
              .set(sanitizeForFirestore(newParentField))
              .catch(err => console.error('Error updating new parent:', err));
          }
        }
      }
      
      // Update field's parent reference
      field.parent = parent || null;
    }

    // Update timestamp
    field.updatedAt = new Date().toISOString();

    // Persist to Firestore
    if (window.FirebaseServices && FirebaseServices.db) {
      FirebaseServices.db.collection('fields').doc(field.id)
        .set(sanitizeForFirestore(field))
        .then(() => {
          console.log('Field updated successfully in Firestore');
        })
        .catch(err => {
          console.error('Error updating field in Firestore:', err);
          alert('Warning: Field updated locally but failed to sync to database.');
        });
    }
  
    // Close modal
    closeFieldModal();

    // UpFdate UI
    renderFieldsMenu();
    
    // Expand the menu to show the updated field
    if (field.parent) {
      expandMenuForField(field.parent);
    }
    expandMenuForField(field.id);
    
    // Show field detail view
    showFieldDetail(editId);
    
    alert('Field updated successfully!');

  } else {
    // ===================================
    // CREATE NEW FIELD
    // ===================================
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      parent: parent || null,
      description: description,
      children: [],
      ownerId: AppState.tenantId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add to AppState
    AppState.fields.push(newField);

    // Update parent's children array if parent exists
    if (parent) {
      const parentField = AppState.fields.find(f => f.id === parent);
      if (parentField) {
        if (!parentField.children) {
          parentField.children = [];
        }
        parentField.children.push(newField.id);
        
        // Update parent in Firestore
        if (window.FirebaseServices && FirebaseServices.db) {
          FirebaseServices.db.collection('fields').doc(parentField.id)
            .set(sanitizeForFirestore(parentField))
            .catch(err => console.error('Error updating parent field:', err));
        }
      }
    }

    // Persist new field to Firestore
    if (window.FirebaseServices && FirebaseServices.db) {
      FirebaseServices.db.collection('fields').doc(newField.id)
        .set(sanitizeForFirestore(newField))
        .then(() => {
          console.log('New field created successfully in Firestore');
        })
        .catch(err => {
          console.error('Error creating field in Firestore:', err);
          alert('Warning: Field created locally but failed to sync to database.');
        });
    }
  }
    // Close modal
    closeFieldModal();

    // Update UI
    renderFieldsMenu();
    
    // Expand parent to show new field
    if (newField.parent) {
      expandMenuForField(newField.parent);
    }
    
    // Show the new field detail
    showFieldDetail(newField.id);
    
    alert('Field created successfully!');
  }


  // Close modal and reset form
  bootstrap.Modal.getInstance(modal).hide();
  document.getElementById('new-field-name').value = '';
  document.getElementById('new-field-desc').value = '';
  modal.removeAttribute('data-edit-id');
  document.querySelector('#fieldModal .modal-title').textContent = 'Create New Field';
  document.querySelector('#fieldModal .btn-primary').textContent = 'Create Field';

  renderFieldsMenu();

  // If editing, stay on field detail view
  if (editId) {
    showFieldDetail(editId);
  } else {
    showAdminHome();
  }

  alert(editId ? 'Field updated successfully!' : 'Field created successfully!');


function openAgentModal(fieldId = null) {
  populateAgentFieldSelect();
  
  if (fieldId) {
    document.getElementById('new-agent-field').value = fieldId;
  }
  
  const modal = new bootstrap.Modal(document.getElementById('agentModal'));
  modal.show();
}

function populateAgentFieldSelect() {
  const select = document.getElementById('new-agent-field');
  select.innerHTML = '<option value="">-- Select Field --</option>';
  
  AppState.fields.forEach(field => {
    const option = document.createElement('option');
    option.value = field.id;
    option.textContent = field.name;
    select.appendChild(option);
  });
}

function createAgent() {
  const name = document.getElementById('new-agent-name').value.trim();
  const agentId = document.getElementById('new-agent-id').value.trim();
  const email = document.getElementById('new-agent-email').value.trim();
  const phone = document.getElementById('new-agent-phone').value.trim();
  const fieldId = document.getElementById('new-agent-field').value;
  const password = document.getElementById('new-agent-password').value;

  if (!name || !agentId || !fieldId || !password) {
    alert('Please fill in all required fields');
    return;
  }

  // Check if agent ID already exists
  if (AppState.agents.find(a => a.agentId === agentId)) {
    alert('Agent ID already exists. Please use a unique ID.');
    return;
  }

  const newAgent = {
    id: `agent_${Date.now()}`,
    name: name,
    agentId: agentId,
    email: email,
    phone: phone,
    fieldId: fieldId,
    password: password,
    ownerId: AppState.tenantId || null,
    createdAt: new Date().toISOString()
  };

  AppState.agents.push(newAgent);

  // Persist to Firestore (Note: for production, use Firebase Auth for agents instead of storing passwords)
  if (window.FirebaseServices && FirebaseServices.db) {
    FirebaseServices.db.collection('agents').doc(newAgent.id).set(sanitizeForFirestore(newAgent)).catch(()=>{});
  }

  // Close modal and reset form
  bootstrap.Modal.getInstance(document.getElementById('agentModal')).hide();
  document.getElementById('new-agent-name').value = '';
  document.getElementById('new-agent-id').value = '';
  document.getElementById('new-agent-email').value = '';
  document.getElementById('new-agent-phone').value = '';
  document.getElementById('new-agent-password').value = 'agent123';

  populateAgentSelect();
  
  if (AppState.currentFieldId) {
    showFieldDetail(AppState.currentFieldId);
  } else {
    showAllAgents();
  }
  
  alert('Agent created successfully!');
}

function deleteAgent(agentId) {
  if (!confirm('Are you sure you want to delete this agent?')) return;

  const index = AppState.agents.findIndex(a => a.id === agentId);
  if (index > -1) {
    const removed = AppState.agents.splice(index, 1)[0];
    
    // Remove from Firestore
    if (window.FirebaseServices && FirebaseServices.db) {
      FirebaseServices.db.collection('agents').doc(removed.id).delete().catch(()=>{});
    }
    
    if (AppState.currentFieldId) {
      showFieldDetail(AppState.currentFieldId);
    } else {
      showAllAgents();
    }
    
    populateAgentSelect();
    alert('Agent deleted successfully');
  }
}

function openFormModal(fieldId = null) {
  AppState.formFields = [];
  document.getElementById('form-fields-container').innerHTML = '';
  populateFormFieldSelect();
  
  if (fieldId) {
    document.getElementById('new-form-field').value = fieldId;
  }
  
  const modal = new bootstrap.Modal(document.getElementById('formModal'));
  modal.show();
}

function populateFormFieldSelect() {
  const select = document.getElementById('new-form-field');
  select.innerHTML = '<option value="">-- Select Field --</option>';
  
  AppState.fields.forEach(field => {
    const option = document.createElement('option');
    option.value = field.id;
    option.textContent = field.name;
    select.appendChild(option);
  });
}

function addFormField(type) {
  const fieldId = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const field = {
    id: fieldId,
    type: type,
    label: '',
    required: false,
    placeholder: '',
    options: (type === 'select' || type === 'radio' || type === 'multiselect') ? ['Option 1'] : undefined,
    max: type === 'rating' ? 5 : undefined,
    min: (type === 'number') ? undefined : undefined,
    maxValue: (type === 'number') ? undefined : undefined,
    minLength: undefined,
    maxLength: undefined,
    accept: (type === 'file') ? undefined : undefined,
    sectionText: (type === 'section') ? '' : undefined
  };

  AppState.formFields.push(field);
  renderFormFields();
}

function renderFormFields() {
  const container = document.getElementById('form-fields-container');
  
  container.innerHTML = AppState.formFields.map((field, index) => `
  <div>
  <button class="btn btn-sm btn-outline-info me-2" onclick="duplicateFormField(${index})" title="Duplicate">
    <i class="fas fa-copy"></i>
  </button>
  <button class="btn btn-sm btn-outline-secondary me-2" onclick="moveFieldUp(${index})" ${index === 0 ? 'disabled' : ''}>
    <i class="fas fa-arrow-up"></i>
  </button>
  <button class="btn btn-sm btn-outline-secondary me-2" onclick="moveFieldDown(${index})" ${index === AppState.formFields.length - 1 ? 'disabled' : ''}>
    <i class="fas fa-arrow-down"></i>
  </button>
  <button class="btn btn-sm btn-outline-danger" onclick="removeFormField(${index})">
    <i class="fas fa-trash"></i>
  </button>
</div>
    <div class="card mb-3" style="border-left: 4px solid #667eea;">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0">
            <i class="fas fa-${getFieldIcon(field.type)} me-2"></i>
            ${capitalizeFirst(field.type)} ${field.type === 'section' ? 'Title' : 'Field'}
          </h6>
          <div>
            <button class="btn btn-sm btn-outline-secondary me-2" onclick="moveFieldUp(${index})" ${index === 0 ? 'disabled' : ''}>
              <i class="fas fa-arrow-up"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary me-2" onclick="moveFieldDown(${index})" ${index === AppState.formFields.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-arrow-down"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="removeFormField(${index})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        
        ${field.type === 'section' ? `
          <!-- Section Title Field -->
          <div class="mb-2">
            <label class="form-label small">Section Title</label>
            <input type="text" class="form-control" 
              value="${field.label || ''}" 
              onchange="updateFormFieldLabel(${index}, this.value)"
              placeholder="e.g., Personal Information">
          </div>
          <div class="mb-2">
            <label class="form-label small">Description (Optional)</label>
            <textarea class="form-control" rows="2"
              onchange="updateFormFieldSectionText(${index}, this.value)"
              placeholder="Add a description for this section">${field.sectionText || ''}</textarea>
          </div>
        ` : `
          <!-- Regular Field Configuration -->
          <div class="row">
            <div class="col-md-6 mb-2">
              <label class="form-label small">Field Label <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" 
                value="${field.label || ''}" 
                onchange="updateFormFieldLabel(${index}, this.value)"
                placeholder="e.g., Full Name, Email Address">
            </div>
            <div class="col-md-3 mb-2">
              <label class="form-label small">Required?</label>
              <select class="form-select form-select-sm" 
                onchange="updateFormFieldRequired(${index}, this.value === 'true')">
                <option value="false" ${!field.required ? 'selected' : ''}>Optional</option>
                <option value="true" ${field.required ? 'selected' : ''}>Required</option>
              </select>
            </div>
          </div>

          ${!['checkbox', 'rating', 'file', 'section'].includes(field.type) ? `
            <div class="mb-2">
              <label class="form-label small">Placeholder Text</label>
              <input type="text" class="form-control form-control-sm" 
                value="${field.placeholder || ''}"
                onchange="updateFormFieldPlaceholder(${index}, this.value)"
                placeholder="e.g., Enter your answer here...">
            </div>
          ` : ''}

          <!-- Type-Specific Options -->
          ${(field.type === 'select' || field.type === 'radio' || field.type === 'multiselect') ? `
            <div class="mt-2">
              <label class="form-label small d-flex justify-content-between align-items-center">
                <span>Options</span>
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="addOptionToField(${index})">
                  <i class="fas fa-plus me-1"></i>Add Option
                </button>
              </label>
              <div id="options-container-${index}">
                ${(field.options || []).map((opt, optIndex) => `
                  <div class="input-group input-group-sm mb-2">
                    <span class="input-group-text">${optIndex + 1}</span>
                    <input type="text" class="form-control" value="${opt}" 
                      onchange="updateFieldOption(${index}, ${optIndex}, this.value)">
                    <button class="btn btn-outline-danger" type="button" onclick="removeFieldOption(${index}, ${optIndex})"
                      ${(field.options || []).length <= 1 ? 'disabled' : ''}>
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${field.type === 'number' ? `
            <div class="row mt-2">
              <div class="col-md-6">
                <label class="form-label small">Minimum Value</label>
                <input type="number" class="form-control form-control-sm" 
                  value="${field.min !== undefined ? field.min : ''}"
                  onchange="updateFormFieldMin(${index}, this.value ? parseFloat(this.value) : undefined)"
                  placeholder="No minimum">
              </div>
              <div class="col-md-6">
                <label class="form-label small">Maximum Value</label>
                <input type="number" class="form-control form-control-sm" 
                  value="${field.maxValue !== undefined ? field.maxValue : ''}"
                  onchange="updateFormFieldMaxValue(${index}, this.value ? parseFloat(this.value) : undefined)"
                  placeholder="No maximum">
              </div>
            </div>
          ` : ''}

          ${field.type === 'textarea' ? `
            <div class="row mt-2">
              <div class="col-md-6">
                <label class="form-label small">Min Length (characters)</label>
                <input type="number" class="form-control form-control-sm" 
                  value="${field.minLength !== undefined ? field.minLength : ''}"
                  onchange="updateFormFieldMinLength(${index}, this.value ? parseInt(this.value) : undefined)"
                  placeholder="No minimum">
              </div>
              <div class="col-md-6">
                <label class="form-label small">Max Length (characters)</label>
                <input type="number" class="form-control form-control-sm" 
                  value="${field.maxLength !== undefined ? field.maxLength : ''}"
                  onchange="updateFormFieldMaxLength(${index}, this.value ? parseInt(this.value) : undefined)"
                  placeholder="No maximum">
              </div>
            </div>
          ` : ''}

          ${field.type === 'rating' ? `
            <div class="mt-2">
              <label class="form-label small">Maximum Rating</label>
              <select class="form-select form-select-sm" 
                onchange="updateFormFieldMax(${index}, parseInt(this.value))">
                ${[3, 4, 5, 6, 7, 8, 9, 10].map(num => `
                  <option value="${num}" ${(field.max || 5) === num ? 'selected' : ''}>${num} Stars</option>
                `).join('')}
              </select>
            </div>
          ` : ''}

          ${field.type === 'file' ? `
            <div class="mt-2">
              <label class="form-label small">Accepted File Types</label>
              <input type="text" class="form-control form-control-sm" 
                value="${field.accept || ''}"
                onchange="updateFormFieldAccept(${index}, this.value)"
                placeholder="e.g., .pdf,.doc,.docx or leave empty for all">
              <small class="text-muted">Separate multiple types with commas</small>
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `).join('');

  updateFieldCountBadge();
}


// Field reordering
function moveFieldUp(index) {
  if (index === 0) return;
  [AppState.formFields[index], AppState.formFields[index - 1]] = 
    [AppState.formFields[index - 1], AppState.formFields[index]];
  renderFormFields();
}

function moveFieldDown(index) {
  if (index === AppState.formFields.length - 1) return;
  [AppState.formFields[index], AppState.formFields[index + 1]] = 
    [AppState.formFields[index + 1], AppState.formFields[index]];
  renderFormFields();
}

// Options management
function addOptionToField(fieldIndex) {
  const field = AppState.formFields[fieldIndex];
  if (!field.options) field.options = [];
  field.options.push(`Option ${field.options.length + 1}`);
  renderFormFields();
}

function removeFieldOption(fieldIndex, optionIndex) {
  const field = AppState.formFields[fieldIndex];
  if (field.options && field.options.length > 1) {
    field.options.splice(optionIndex, 1);
    renderFormFields();
  }
}

function updateFieldOption(fieldIndex, optionIndex, value) {
  const field = AppState.formFields[fieldIndex];
  if (field.options) {
    field.options[optionIndex] = value.trim();
  }
}

// Field property updates
function updateFormFieldPlaceholder(index, value) {
  AppState.formFields[index].placeholder = value;
}

function updateFormFieldSectionText(index, value) {
  AppState.formFields[index].sectionText = value;
}

function updateFormFieldMin(index, value) {
  AppState.formFields[index].min = value;
}

function updateFormFieldMaxValue(index, value) {
  AppState.formFields[index].maxValue = value;
}

function updateFormFieldMinLength(index, value) {
  AppState.formFields[index].minLength = value;
}

function updateFormFieldMaxLength(index, value) {
  AppState.formFields[index].maxLength = value;
}

function updateFormFieldAccept(index, value) {
  AppState.formFields[index].accept = value;
}

function getFieldIcon(type) {
  const icons = {
    text: 'font',
    number: 'hashtag',
    date: 'calendar',
    time: 'clock',
    email: 'envelope',
    phone: 'phone',
    textarea: 'align-left',
    select: 'list',
    multiselect: 'tasks',
    radio: 'dot-circle',
    checkbox: 'check-square',
    file: 'file-upload',
    rating: 'star',
    section: 'heading'
  };
  return icons[type] || 'square';
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateFormFieldLabel(index, value) {
  AppState.formFields[index].label = value;
}

function updateFormFieldRequired(index, value) {
  AppState.formFields[index].required = value;
}

function updateFormFieldOptions(index, value) {
  AppState.formFields[index].options = value.split(',').map(o => o.trim()).filter(o => o);
}

function updateFormFieldMax(index, value) {
  AppState.formFields[index].max = value;
}

function removeFormField(index) {
  AppState.formFields.splice(index, 1);
  renderFormFields();
}

function createForm() {
  // Validate form builder
  const validation = validateFormBuilder();
  
  if (!validation.isValid) {
    showValidationErrors(validation.errors);
    return;
  }

  const name = document.getElementById('new-form-name').value.trim();
  const fieldId = document.getElementById('new-form-field').value;
  const description = document.getElementById('new-form-desc').value.trim();

  if (!name) {
    alert('Please enter a form name');
    return;
  }

  if (!fieldId) {
    alert('Please select a field for this form');
    return;
  }

  if (AppState.formFields.length === 0) {
    alert('Please add at least one form field');
    return;
  }

  // Validate all fields have labels (except section type)
  const invalidFields = AppState.formFields.filter(f => f.type !== 'section' && !f.label.trim());
  if (invalidFields.length > 0) {
    alert('Please provide labels for all form fields');
    return;
  }

  // Validate fields with options have at least one option
  const invalidOptionFields = AppState.formFields.filter(f => 
    (f.type === 'select' || f.type === 'radio' || f.type === 'multiselect') && 
    (!f.options || f.options.length === 0 || f.options.every(opt => !opt.trim()))
  );
  
  if (invalidOptionFields.length > 0) {
    alert('Please provide at least one option for dropdown, radio, and multiselect fields');
    return;
  }

  const newForm = {
    id: `form_${Date.now()}`,
    name: name,
    fieldId: fieldId,
    description: description,
    fields: AppState.formFields.map(f => {
      const base = { 
        id: f.id, 
        type: f.type, 
        label: f.label, 
        required: !!f.required 
      };
      
      // Add optional properties only if they exist
      if (f.placeholder) base.placeholder = f.placeholder;
      if (f.type === 'section' && f.sectionText) base.sectionText = f.sectionText;
      if ((f.type === 'select' || f.type === 'radio' || f.type === 'multiselect') && f.options) {
        base.options = f.options.filter(opt => opt.trim()).slice();
      }
      if (f.type === 'rating') base.max = typeof f.max === 'number' ? f.max : 5;
      if (f.type === 'number') {
        if (f.min !== undefined) base.min = f.min;
        if (f.maxValue !== undefined) base.max = f.maxValue;
      }
      if (f.type === 'textarea') {
        if (f.minLength !== undefined) base.minLength = f.minLength;
        if (f.maxLength !== undefined) base.maxLength = f.maxLength;
      }
      if (f.type === 'file' && f.accept) base.accept = f.accept;
      
      return base;
    }),
    ownerId: AppState.tenantId || null,
    createdAt: new Date().toISOString()
  };

  AppState.forms.push(newForm);

  // Persist to Firestore
  if (window.FirebaseServices && FirebaseServices.db) {
    const formForDb = sanitizeForFirestore(newForm);
    FirebaseServices.db.collection('forms').doc(newForm.id)
      .set(formForDb)
      .catch(() => {});
  }

  // Close modal and reset
  const modal = bootstrap.Modal.getInstance(document.getElementById('formModal'));
  if (modal) modal.hide();
  
  document.getElementById('new-form-name').value = '';
  document.getElementById('new-form-desc').value = '';
  AppState.formFields = [];
  document.getElementById('form-fields-container').innerHTML = '';

  if (AppState.currentFieldId) {
    showFieldDetail(AppState.currentFieldId);
  } else {
    showAllForms();
  }
  
  alert('Form created successfully!');
}

function deleteForm(formId) {
  if (!confirm('Are you sure you want to delete this form? All submissions will also be deleted.')) return;

  // Remove form
  const formIndex = AppState.forms.findIndex(f => f.id === formId);
  if (formIndex > -1) {
    AppState.forms.splice(formIndex, 1);
  }

  // Remove all submissions for this form
  AppState.submissions = AppState.submissions.filter(s => s.formId !== formId);

  // Remove from Firestore
  if (window.FirebaseServices && FirebaseServices.db) {
    FirebaseServices.db.collection('forms').doc(formId).delete().catch(()=>{});
  }

  if (AppState.currentFieldId) {
    showFieldDetail(AppState.currentFieldId);
  } else {
    showAllForms();
  }
  
  alert('Form deleted successfully');
}

// ===================================
// DATA EXPORT FUNCTIONS
// ===================================

function exportFormData(formId) {
  const form = AppState.forms.find(f => f.id === formId);
  if (!form) return;

  const submissions = AppState.submissions.filter(s => s.formId === formId);
  
  if (submissions.length === 0) {
    alert('No submissions to export');
    return;
  }

  // Prepare CSV data
  const headers = ['Submission ID', 'Agent', 'Submitted At', ...form.fields.map(f => f.label)];
  const rows = submissions.map(sub => {
    const agent = AppState.agents.find(a => a.id === sub.agentId);
    return [
      sub.id,
      agent ? agent.name : 'Unknown',
      new Date(sub.submittedAt).toLocaleString(),
      ...form.fields.map(f => sub.data[f.id] || '')
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  downloadCSV(csvContent, `${form.name}_export_${Date.now()}.csv`);
}

function exportAllData() {
  const data = {
    fields: AppState.fields,
    agents: AppState.agents,
    forms: AppState.forms,
    submissions: AppState.submissions,
    exportedAt: new Date().toISOString()
  };

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field_management_export_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================================
// FIELD MANAGEMENT
// ===================================

function openEditFieldModal(fieldId) {
  const field = AppState.fields.find(f => f.id === fieldId);
  
  if (!field) {
    alert('Field not found');
    return;
  }

  // Populate parent select dropdown
  populateFieldParentSelect(fieldId); // Pass fieldId to exclude it from parent options

  // Fill in the form with existing field data
  document.getElementById('new-field-name').value = field.name;
  document.getElementById('new-field-desc').value = field.description || '';
  document.getElementById('new-field-parent').value = field.parent || '';

  // Change modal title and button text for edit mode
  document.querySelector('#fieldModal .modal-title').innerHTML = '<i class="fas fa-edit me-2"></i>Edit Field';
  document.querySelector('#fieldModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Save Changes';
  
  // Set data attribute to track edit mode
  document.getElementById('fieldModal').setAttribute('data-edit-id', fieldId);

  // Show modal
  try {
    const modalElement = document.getElementById('fieldModal');
    const modal = new bootstrap.Modal(modalElement, {
      backdrop: 'static',
      keyboard: true
    });
    modal.show();
  } catch (error) {
    console.error('Error opening edit modal:', error);
    alert('Error opening modal. Please check if Bootstrap is loaded correctly.');
  }
}

function deleteField(fieldId) {
  const field = AppState.fields.find(f => f.id === fieldId);
  if (!field) return;

  // Check if field has subfields
  const hasSubfields = AppState.fields.some(f => f.parent === fieldId);
  if (hasSubfields) {
    alert('Cannot delete field that has subfields. Please delete or move subfields first.');
    return;
  }

  // Check if field has forms
  const hasForms = AppState.forms.some(f => f.fieldId === fieldId);
  if (hasForms) {
    alert('Cannot delete field that has forms. Please delete forms first.');
    return;
  }

  // Check if field has agents
  const hasAgents = AppState.agents.some(a => a.fieldId === fieldId);
  if (hasAgents) {
    alert('Cannot delete field that has assigned agents. Please reassign or delete agents first.');
    return;
  }

  if (!confirm('Are you sure you want to delete this field?')) return;

  // Remove field
  const index = AppState.fields.findIndex(f => f.id === fieldId);
  if (index > -1) {
    AppState.fields.splice(index, 1);
  }

  // Remove from Firestore
  if (window.FirebaseServices && FirebaseServices.db) {
    FirebaseServices.db.collection('fields').doc(fieldId).delete().catch(()=>{});
  }

  // Update UI
  renderFieldsMenu();
  showAdminHome();
  alert('Field deleted successfully');
}

// ===================================
// CHART RENDERING
// ===================================

function renderSubmissionsChart() {
  const chartDiv = document.getElementById('submissions-chart');
  if (!chartDiv) return;

  // Group submissions by date
  const submissionsByDate = {};
  
  AppState.submissions.forEach(sub => {
    const date = new Date(sub.submittedAt).toLocaleDateString();
    submissionsByDate[date] = (submissionsByDate[date] || 0) + 1;
  });

  const dates = Object.keys(submissionsByDate).sort();
  const counts = dates.map(date => submissionsByDate[date]);

  if (dates.length === 0) {
    chartDiv.innerHTML = '<p class="text-center text-muted">No submission data available</p>';
    return;
  }

  // Create simple bar chart using D3
  const margin = {top: 20, right: 20, bottom: 60, left: 50};
  const width = chartDiv.offsetWidth - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  chartDiv.innerHTML = '';

  const svg = d3.select(chartDiv)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(dates)
    .range([0, width])
    .padding(0.3);

  const y = d3.scaleLinear()
    .domain([0, d3.max(counts)])
    .nice()
    .range([height, 0]);

  // Add bars
  svg.selectAll('.bar')
    .data(dates)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', d => x(d))
    .attr('y', d => y(submissionsByDate[d]))
    .attr('width', x.bandwidth())
    .attr('height', d => height - y(submissionsByDate[d]))
    .attr('fill', '#667eea')
    .attr('opacity', 0.8);

  // Add x-axis
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end');

  // Add y-axis
  svg.append('g')
    .call(d3.axisLeft(y).ticks(5));

  // Add labels
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 10)
    .style('text-anchor', 'middle')
    .text('Date');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 15)
    .style('text-anchor', 'middle')
    .text('Submissions');
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

function setActiveMenu(type, index) {
  const selector = type === 'admin' ? '#admin-screen .menu-item' : '#agent-screen .menu-item';
  const menuItems = document.querySelectorAll(selector);
  
  menuItems.forEach((item, i) => {
    if (i === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// ===================================
// AUTO-SAVE TO LOCAL STORAGE (OPTIONAL)
// ===================================

// Uncomment below if you want to persist data across browser sessions
// Note: This uses localStorage which should work in most browsers

/*
function saveToStorage() {
  try {
    localStorage.setItem('fieldManagementData', JSON.stringify({
      fields: AppState.fields,
      agents: AppState.agents,
      forms: AppState.forms,
      submissions: AppState.submissions
    }));
  } catch (e) {
    console.error('Failed to save to storage:', e);
  }
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem('fieldManagementData');
    if (data) {
      const parsed = JSON.parse(data);
      AppState.fields = parsed.fields || [];
      AppState.agents = parsed.agents || [];
      AppState.forms = parsed.forms || [];
      AppState.submissions = parsed.submissions || [];
      return true;
    }
  } catch (e) {
    console.error('Failed to load from storage:', e);
  }
  return false;
}

// Auto-save on state changes
setInterval(saveToStorage, 5000); // Save every 5 seconds
*/



function previewForm() {
  if (AppState.formFields.length === 0) {
    alert('Please add at least one field to preview');
    return;
  }

  const formName = document.getElementById('new-form-name').value.trim() || 'Untitled Form';
  const formDesc = document.getElementById('new-form-desc').value.trim();

  const previewContent = `
    <div class="p-3">
      <h4 class="mb-2">${formName}</h4>
      ${formDesc ? `<p class="text-muted mb-4">${formDesc}</p>` : ''}
      <hr>
      <form id="preview-form">
        ${AppState.formFields.map(field => renderFormField(field)).join('')}
      </form>
    </div>
  `;

  document.getElementById('form-preview-content').innerHTML = previewContent;
  
  const modal = new bootstrap.Modal(document.getElementById('formPreviewModal'));
  modal.show();
}







function validateFormBuilder() {
  const errors = [];
  
  const name = document.getElementById('new-form-name').value.trim();
  const fieldId = document.getElementById('new-form-field').value;
  
  if (!name) {
    errors.push('Form name is required');
  }
  
  if (!fieldId) {
    errors.push('Please select a field for this form');
  }
  
  if (AppState.formFields.length === 0) {
    errors.push('Add at least one form field');
  }
  
  // Check for fields without labels
  const unlabeledFields = AppState.formFields.filter((f, i) => 
    f.type !== 'section' && !f.label.trim()
  );
  
  if (unlabeledFields.length > 0) {
    errors.push(`${unlabeledFields.length} field(s) missing labels`);
  }
  
  // Check for option fields without options
  const invalidOptionFields = AppState.formFields.filter(f => 
    (f.type === 'select' || f.type === 'radio' || f.type === 'multiselect') && 
    (!f.options || f.options.length === 0 || f.options.every(opt => !opt.trim()))
  );
  
  if (invalidOptionFields.length > 0) {
    errors.push(`${invalidOptionFields.length} dropdown/radio field(s) missing options`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

function showValidationErrors(errors) {
  const errorHtml = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      <h6 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>Please fix the following issues:</h6>
      <ul class="mb-0">
        ${errors.map(err => `<li>${err}</li>`).join('')}
      </ul>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
  
  // Insert at top of modal body
  const modalBody = document.querySelector('#formModal .modal-body');
  const existingAlert = modalBody.querySelector('.alert');
  if (existingAlert) existingAlert.remove();
  
  modalBody.insertAdjacentHTML('afterbegin', errorHtml);
  
  // Scroll to top of modal
  modalBody.scrollTop = 0;
}






// Keyboard shortcuts for form builder
document.addEventListener('keydown', function(e) {
  // Only active when form modal is open
  const formModal = document.getElementById('formModal');
  if (!formModal || !formModal.classList.contains('show')) return;
  
  // Ctrl/Cmd + Enter to create form
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    createForm();
  }
  
  // Ctrl/Cmd + P to preview
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    previewForm();
  }
  
  // Escape to close (default behavior, but good to note)
});


function duplicateFormField(index) {
  const original = AppState.formFields[index];
  const duplicate = {
    ...original,
    id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    label: original.label + ' (Copy)',
    options: original.options ? [...original.options] : undefined
  };
  
  AppState.formFields.splice(index + 1, 0, duplicate);
  renderFormFields();
}






function loadFormTemplate(templateName) {
  const templates = {
    'contact': [
      { type: 'section', label: 'Contact Information', sectionText: 'Please provide your contact details' },
      { type: 'text', label: 'Full Name', required: true, placeholder: 'John Doe' },
      { type: 'email', label: 'Email Address', required: true, placeholder: 'john@example.com' },
      { type: 'phone', label: 'Phone Number', required: true, placeholder: '+1234567890' },
      { type: 'textarea', label: 'Message', required: true, placeholder: 'How can we help you?' }
    ],
    'survey': [
      { type: 'section', label: 'Customer Satisfaction Survey', sectionText: 'Help us improve our service' },
      { type: 'rating', label: 'Overall Satisfaction', required: true, max: 5 },
      { type: 'radio', label: 'Would you recommend us?', required: true, options: ['Yes', 'No', 'Maybe'] },
      { type: 'multiselect', label: 'What did you like?', options: ['Quality', 'Price', 'Service', 'Speed'] },
      { type: 'textarea', label: 'Additional Comments', placeholder: 'Share your thoughts...' }
    ],
    'registration': [
      { type: 'section', label: 'Personal Information' },
      { type: 'text', label: 'First Name', required: true },
      { type: 'text', label: 'Last Name', required: true },
      { type: 'email', label: 'Email', required: true },
      { type: 'date', label: 'Date of Birth', required: true },
      { type: 'section', label: 'Preferences' },
      { type: 'checkbox', label: 'I agree to terms and conditions', required: true },
      { type: 'checkbox', label: 'Subscribe to newsletter' }
    ],
    'feedback': [
      { type: 'text', label: 'Your Name', required: true },
      { type: 'select', label: 'Category', required: true, options: ['Bug Report', 'Feature Request', 'General Feedback', 'Complaint'] },
      { type: 'rating', label: 'Rate your experience', required: true, max: 5 },
      { type: 'textarea', label: 'Detailed Feedback', required: true, minLength: 20 },
      { type: 'file', label: 'Attach Screenshot (optional)', accept: '.jpg,.jpeg,.png' }
    ]
  };
  
  const template = templates[templateName];
  if (!template) return;
  
  // Clear existing fields
  AppState.formFields = [];
  
  // Load template fields
  template.forEach(field => {
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...field
    };
    AppState.formFields.push(newField);
  });
  
  renderFormFields();
  alert(`Template "${templateName}" loaded! You can now customize the fields.`);
}








function updateFieldCountBadge() {
  const badge = document.getElementById('field-count-badge');
  if (badge) {
    badge.textContent = AppState.formFields.length;
    badge.style.display = AppState.formFields.length > 0 ? 'inline-block' : 'none';
  }
}





function exportFormStructure(formId) {
  const form = AppState.forms.find(f => f.id === formId);
  if (!form) return;
  
  const structure = {
    name: form.name,
    description: form.description,
    fields: form.fields
  };
  
  const json = JSON.stringify(structure, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `form_${form.name.replace(/\s+/g, '_')}_structure.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



function checkBootstrap() {
  if (typeof bootstrap === 'undefined') {
    console.error('Bootstrap is not loaded!');
    alert('Bootstrap JavaScript is not loaded. Please check your script tags.');
    return false;
  }
  console.log('Bootstrap version:', bootstrap.Tooltip.VERSION);
  return true;
}

// Call this when page loads
document.addEventListener('DOMContentLoaded', () => {
  checkBootstrap();
  initializeApp();
  setupEventListeners();
  // ... rest of your initialization

});




function validateFieldName(name) {
  const input = document.getElementById('new-field-name');
  
  if (!name || name.trim() === '') {
    input.classList.add('is-invalid');
    input.classList.remove('is-valid');
    
    // Show error message
    let feedback = input.nextElementSibling;
    if (!feedback || !feedback.classList.contains('invalid-feedback')) {
      feedback = document.createElement('div');
      feedback.className = 'invalid-feedback';
      input.parentNode.insertBefore(feedback, input.nextSibling);
    }
    feedback.textContent = 'Field name is required';
    
    return false;
  } else {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
    
    // Remove error message
    const feedback = input.nextElementSibling;
    if (feedback && feedback.classList.contains('invalid-feedback')) {
      feedback.remove();
    }
    
    return true;
  }
}

// Add this to the name input's onchange event
document.getElementById('new-field-name').addEventListener('input', function() {
  validateFieldName(this.value);
});


// 🧹 Auto-fix for duplicate modal backdrops
document.addEventListener('DOMNodeInserted', function (event) {
  // Check if a backdrop was added
  if (event.target.classList && event.target.classList.contains('modal-backdrop fade show')) {
    // If there are multiple, remove all but the last one
    const allBackdrops = document.querySelectorAll('.modal-backdrop fade show');
    if (allBackdrops.length > 1) {
      for (let i = 0; i < allBackdrops.length - 1; i++) {
        allBackdrops[i].remove();
      }
    }
  }
});
