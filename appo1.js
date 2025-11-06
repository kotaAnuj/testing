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

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'date':
    case 'time':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="${field.type}" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
    
    case 'number':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="number" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
    
    case 'textarea':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <textarea name="${field.id}" class="form-control" rows="3" ${required}></textarea>
        </div>
      `;
    
    case 'select':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <select name="${field.id}" class="form-select" ${required}>
            <option value="">-- Select --</option>
            ${(field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        </div>
      `;
    
    case 'multiselect':
      return `
        <div class="mb-3">
          <label class="form-label d-block">${field.label} ${requiredLabel}</label>
          <div class="border rounded p-3" style="max-height: 200px; overflow-y: auto;">
            ${(field.options || []).map((opt, i) => `
              <div class="form-check">
                <input class="form-check-input multiselect-option" type="checkbox" name="${field.id}[]" id="${field.id}_${i}" value="${opt}">
                <label class="form-check-label" for="${field.id}_${i}">${opt}</label>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    
    case 'radio':
      return `
        <div class="mb-3">
          <label class="form-label d-block">${field.label} ${requiredLabel}</label>
          ${(field.options || []).map((opt, i) => `
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="${field.id}" id="${field.id}_${i}" value="${opt}" ${required}>
              <label class="form-check-label" for="${field.id}_${i}">${opt}</label>
            </div>
          `).join('')}
        </div>
      `;
    
    case 'checkbox':
      return `
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" name="${field.id}" id="${field.id}">
            <label class="form-check-label" for="${field.id}">${field.label} ${requiredLabel}</label>
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
        </div>
      `;
    
    case 'file':
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="file" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
    
    default:
      return `
        <div class="mb-3">
          <label class="form-label">${field.label} ${requiredLabel}</label>
          <input type="text" name="${field.id}" class="form-control" ${required}>
        </div>
      `;
  }
}

function submitAgentForm(formId, isDraft = false) {
  const form = document.getElementById('agent-submission-form');
  const formData = new FormData(form);
  const data = {};

  for (let [key, value] of formData.entries()) {
    data[key] = value;
  }

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
    FirebaseServices.db.collection('submissions').doc(submission.id).set(sanitizeForFirestore(submission)).catch(()=>{});
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
      <h5 class="mb-3">${form.name}</h5>
      <p class="text-muted mb-4">Submitted: ${new Date(submission.submittedAt).toLocaleString()}</p>
      
      <table class="table">
        <tbody>
          ${form.fields.map(field => `
            <tr>
              <th style="width: 30%">${field.label}</th>
              <td>${submission.data[field.id] || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('agent-content').innerHTML = content;
}

// ===================================
// MODAL FUNCTIONS
// ===================================

function openFieldModal() {
  populateFieldParentSelect();
  const modal = new bootstrap.Modal(document.getElementById('fieldModal'));
  modal.show();
}


function populateFieldParentSelect() {
  const select = document.getElementById('new-field-parent');
  select.innerHTML = '<option value="">-- Root Level --</option>';
  
  AppState.fields.forEach(field => {
    const option = document.createElement('option');
    option.value = field.id;
    option.textContent = field.name;
    select.appendChild(option);
  });
}

function createField() {
  const name = document.getElementById('new-field-name').value.trim();
  const parent = document.getElementById('new-field-parent').value;
  const description = document.getElementById('new-field-desc').value.trim();
  const modal = document.getElementById('fieldModal');
  const editId = modal.getAttribute('data-edit-id');

  if (!name) {
    alert('Please enter a field name');
    return;
  }

  if (editId) {
    // Edit existing field
    const field = AppState.fields.find(f => f.id === editId);
    if (field) {
      field.name = name;
      field.description = description;
      
      // Handle parent change
      if (field.parent !== parent) {
        // Remove from old parent's children
        if (field.parent) {
          const oldParent = AppState.fields.find(f => f.id === field.parent);
          if (oldParent) {
            const index = oldParent.children.indexOf(field.id);
            if (index > -1) oldParent.children.splice(index, 1);
          }
        }
        
        // Add to new parent's children
        if (parent) {
          const newParent = AppState.fields.find(f => f.id === parent);
          if (newParent) {
            newParent.children = newParent.children || [];
            newParent.children.push(field.id);
          }
        }
        
        field.parent = parent || null;
      }

      // Persist edit to Firestore
      if (window.FirebaseServices && FirebaseServices.db) {
        FirebaseServices.db.collection('fields').doc(field.id).set(sanitizeForFirestore(field)).catch(()=>{});
      }
    }
  } else {
    // Create new field
    const newField = {
      id: `field_${Date.now()}`,
      name: name,
      parent: parent || null,
      description: description,
      children: [],
    ownerId: AppState.tenantId || null,
    createdAt: new Date().toISOString()
    };

    AppState.fields.push(newField);

    // Update parent's children array if parent exists
    if (parent) {
      const parentField = AppState.fields.find(f => f.id === parent);
      if (parentField) {
        parentField.children.push(newField.id);
      }
    }

    // Persist create to Firestore
    if (window.FirebaseServices && FirebaseServices.db) {
      FirebaseServices.db.collection('fields').doc(newField.id).set(sanitizeForFirestore(newField)).catch(()=>{});
    }
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
}

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
    minLength: undefined,
    maxLength: undefined,
    min: undefined,
    max: undefined
  };

  AppState.formFields.push(field);
  renderFormFields();
}

function renderFormFields() {
  const container = document.getElementById('form-fields-container');
  
  container.innerHTML = AppState.formFields.map((field, index) => `
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0">
            <i class="fas fa-${getFieldIcon(field.type)} me-2"></i>
            ${capitalizeFirst(field.type)} Field
          </h6>
          <button class="btn btn-sm btn-outline-danger" onclick="removeFormField(${index})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        
        <div class="row">
          <div class="col-md-8 mb-2">
            <label class="form-label small">Field Label</label>
            <input type="text" class="form-control form-control-sm" 
              value="${field.label}" 
              onchange="updateFormFieldLabel(${index}, this.value)"
              placeholder="e.g., Full Name">
          </div>
          <div class="col-md-4 mb-2">
            <label class="form-label small">Required?</label>
            <select class="form-select form-select-sm" 
              onchange="updateFormFieldRequired(${index}, this.value === 'true')">
              <option value="false" ${!field.required ? 'selected' : ''}>No</option>
              <option value="true" ${field.required ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        </div>

        ${field.type === 'select' || field.type === 'radio' ? `
          <div class="mt-2">
            <label class="form-label small">Options (comma-separated)</label>
            <input type="text" class="form-control form-control-sm" 
              value="${(field.options || []).join(', ')}"
              onchange="updateFormFieldOptions(${index}, this.value)"
              placeholder="e.g., Yes, No, Maybe">
          </div>
        ` : ''}

        ${field.type === 'rating' ? `
          <div class="mt-2">
            <label class="form-label small">Maximum Rating</label>
            <input type="number" class="form-control form-control-sm" 
              value="${field.max || 5}"
              min="1" max="10"
              onchange="updateFormFieldMax(${index}, parseInt(this.value))">
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
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
    radio: 'dot-circle',
    checkbox: 'check-square',
    file: 'file-upload',
    rating: 'star'
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
  const name = document.getElementById('new-form-name').value.trim();
  const fieldId = document.getElementById('new-form-field').value;
  const description = document.getElementById('new-form-desc').value.trim();

  if (!name || !fieldId) {
    alert('Please enter form name and select a field');
    return;
  }

  if (AppState.formFields.length === 0) {
    alert('Please add at least one form field');
    return;
  }

  // Validate all fields have labels
  const invalidFields = AppState.formFields.filter(f => !f.label.trim());
  if (invalidFields.length > 0) {
    alert('Please provide labels for all form fields');
    return;
  }

  const newForm = {
    id: `form_${Date.now()}`,
    name: name,
    fieldId: fieldId,
    description: description,
    // Ensure we don't keep undefined keys inside field definitions
    fields: AppState.formFields.map(f => {
      const base = { id: f.id, type: f.type, label: f.label, required: !!f.required };
      if (f.type === 'select' || f.type === 'radio') base.options = (f.options || []).slice();
      if (f.type === 'rating') base.max = typeof f.max === 'number' ? f.max : 5;
      return base;
    }),
    ownerId: AppState.tenantId || null,
    createdAt: new Date().toISOString()
  };

  AppState.forms.push(newForm);

  // Persist to Firestore
  if (window.FirebaseServices && FirebaseServices.db) {
    const formForDb = sanitizeForFirestore(newForm);
    FirebaseServices.db.collection('forms').doc(newForm.id).set(formForDb).catch(()=>{});
  }

  // Close modal and reset
  bootstrap.Modal.getInstance(document.getElementById('formModal')).hide();
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
  if (!field) return;

  // Update the field modal for edit mode
  document.getElementById('new-field-name').value = field.name;
  document.getElementById('new-field-desc').value = field.description || '';
  document.getElementById('new-field-parent').value = field.parent || '';

  // Change modal title and button text
  document.querySelector('#fieldModal .modal-title').textContent = 'Edit Field';
  document.querySelector('#fieldModal .btn-primary').textContent = 'Save Changes';
  
  // Add data attribute to track edit mode
  document.getElementById('fieldModal').setAttribute('data-edit-id', fieldId);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('fieldModal'));
  modal.show();
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