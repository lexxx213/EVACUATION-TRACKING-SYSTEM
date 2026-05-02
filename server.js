console.log('EVTS server.js LOADED');

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'evts_user',
  password: 'Evts123!',
  database: 'evacuation_system'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }

  console.log('Connected to MySQL database');
});

/* -------------------- HELPERS -------------------- */

function buildCenterStatus(totalEvacuees, capacity) {
  if (!capacity || capacity <= 0) return 'Normal';
  if (totalEvacuees >= capacity) return 'Full';
  if (totalEvacuees >= capacity * 0.8) return 'Near Full';
  return 'Normal';
}

function normalizePhoneNumber(phone) {
  return String(phone || '').replace(/\s+/g, '').trim();
}

function isValidAge(age) {
  if (age === undefined || age === null || age === '') return true;
  const parsedAge = Number(age);
  return Number.isInteger(parsedAge) && parsedAge >= 0 && parsedAge <= 130;
}

function isValidPhoneNumber(phone) {
  if (phone === undefined || phone === null || phone === '') return true;
  const normalized = normalizePhoneNumber(phone);
  return /^\+63\d{10}$/.test(normalized);
}

function normalizeYesNo(value, defaultValue = 'No') {
  if (value === undefined || value === null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'yes' ? 'Yes' : 'No';
}

function normalizeLocation(value) {
  const location = String(value || '').trim();

  if (!location) return null;

  const lowered = location.toLowerCase();

  if (
    lowered === 'Cataggaman pardo' ||
    lowered === 'Cataggaman pardo' ||
    lowered === 'Cataggaman pardo' ||
    lowered === 'Cataggaman pardo'
  ) {
    return 'Cataggaman Pardo';
  }

  if (lowered === 'centro 1') return 'Centro 1';
  if (lowered === 'centro 10') return 'Centro 10';
  if (lowered === 'centro 11') return 'Centro 11';
  if (lowered === 'centro 12') return 'Centro 12';
  if (lowered === 'gosi norte') return 'Gosi Norte';
  if (lowered === 'linao norte/west') return 'Linao Norte/West';

  return location;
}

function sanitizeEvacueeRow(row) {
  const cleanedAge = isValidAge(row.age)
    ? (row.age === null || row.age === '' ? null : Number(row.age))
    : null;

  const cleanedPhone = isValidPhoneNumber(row.phone_number)
    ? normalizePhoneNumber(row.phone_number)
    : null;

  return {
    ...row,
    age: cleanedAge,
    phone_number: cleanedPhone,
    evacuation_location: normalizeLocation(row.evacuation_location),
    pwd: normalizeYesNo(row.pwd, 'No'),
    pregnant: normalizeYesNo(row.pregnant, 'No')
  };
}

/* -------------------- BASIC ROUTES -------------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API is healthy' });
});

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.get('/api/message', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' });
});

/* -------------------- LOGIN -------------------- */

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const sql = `
    SELECT id, username, role, barangay, evacuation_location
    FROM users
    WHERE username = ? AND password = ?
    LIMIT 1
  `;

  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error('Login query error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = results[0];

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      barangay: normalizeLocation(user.barangay),
      evacuation_location: normalizeLocation(user.evacuation_location)
    });
  });
});

/* -------------------- GENERAL EVACUEES -------------------- */

app.get('/api/evacuees', (req, res) => {
  const location = normalizeLocation(req.query.location);

  if (!location) {
    return res.status(400).json({ message: 'location query param is required' });
  }

  const sql = `
    SELECT
      id,
      lastname,
      firstname,
      middlename,
      age,
      gender,
      evacuation_location,
      phone_number,
      pwd,
      pregnant,
      created_at,
      status,
      returned_at
    FROM evacuees
    WHERE TRIM(evacuation_location) = TRIM(?)
    ORDER BY id DESC
  `;

  db.query(sql, [location], (err, results) => {
    if (err) {
      console.error('Evacuees SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json(results.map(sanitizeEvacueeRow));
  });
});

/* -------------------- OFFICIAL EVACUEES -------------------- */

app.get('/api/evacuees/official', (req, res) => {
  const username = String(req.query.username || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'username query param is required' });
  }

  const sqlUser = `
    SELECT barangay, evacuation_location, role
    FROM users
    WHERE username = ?
    LIMIT 1
  `;

  db.query(sqlUser, [username], (err, userRows) => {
    if (err) {
      console.error('User SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];

    if (user.role !== 'official') {
      return res.status(403).json({ message: 'Not an official account' });
    }

    const location = normalizeLocation(user.barangay || user.evacuation_location);

    const sqlEvac = `
      SELECT
        id,
        lastname,
        firstname,
        middlename,
        age,
        gender,
        evacuation_location,
        phone_number,
        pwd,
        pregnant,
        created_at,
        status,
        returned_at
      FROM evacuees
      WHERE TRIM(evacuation_location) = TRIM(?)
      ORDER BY id DESC
    `;

    db.query(sqlEvac, [location], (err2, evacRows) => {
      if (err2) {
        console.error('Evacuees SELECT error:', err2.message);
        return res.status(500).json({ message: err2.message });
      }

      res.json(evacRows.map(sanitizeEvacueeRow));
    });
  });
});

/* -------------------- CREATE EVACUEE -------------------- */

app.post('/api/evacuees', (req, res) => {
  const lastname = String(req.body.lastname || '').trim();
  const firstname = String(req.body.firstname || '').trim();
  const middlename = String(req.body.middlename || '').trim();
  const age = req.body.age;
  const gender = String(req.body.gender || '').trim();
  const evacuation_location = normalizeLocation(req.body.evacuation_location);
  const phone_number = normalizePhoneNumber(req.body.phone_number);
  const pwd = normalizeYesNo(req.body.pwd, 'No');
  const pregnantInput = normalizeYesNo(req.body.pregnant, 'No');

  if (!lastname || !firstname) {
    return res.status(400).json({ message: 'lastname and firstname are required' });
  }

  if (!gender) {
    return res.status(400).json({ message: 'gender is required' });
  }

  if (!evacuation_location) {
    return res.status(400).json({ message: 'evacuation_location is required' });
  }

  if (!isValidAge(age)) {
    return res.status(400).json({
      message: 'Age must be a whole number and cannot be negative'
    });
  }

  if (!isValidPhoneNumber(phone_number)) {
    return res.status(400).json({
      message: 'Phone number must start with +63 and contain 10 digits after it (example: +639123456789)'
    });
  }

  const finalPregnant = gender === 'Female' ? pregnantInput : 'No';

  const sql = `
    INSERT INTO evacuees
    (
      lastname,
      firstname,
      middlename,
      age,
      gender,
      evacuation_location,
      phone_number,
      pwd,
      pregnant,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `;

  const values = [
    lastname,
    firstname,
    middlename || null,
    age === '' || age === null || age === undefined ? null : Number(age),
    gender,
    evacuation_location,
    phone_number || null,
    pwd,
    finalPregnant
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Evacuees INSERT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json({
      message: 'Evacuee saved!',
      id: result.insertId
    });
  });
});

/* -------------------- OFFICIAL RETURN EVACUEE -------------------- */

app.put('/api/official/evacuees/:id/return', (req, res) => {
  const evacueeId = req.params.id;
  const username = String(req.body.username || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'username is required' });
  }

  const sqlUser = `
    SELECT barangay, evacuation_location, role
    FROM users
    WHERE username = ?
    LIMIT 1
  `;

  db.query(sqlUser, [username], (err, userRows) => {
    if (err) {
      console.error('Return user lookup error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];

    if (user.role !== 'official') {
      return res.status(403).json({ message: 'Not an official account' });
    }

    const location = normalizeLocation(user.barangay || user.evacuation_location);

    const sqlUpdate = `
      UPDATE evacuees
      SET status = 'Returned',
          returned_at = NOW()
      WHERE id = ?
        AND TRIM(evacuation_location) = TRIM(?)
    `;

    db.query(sqlUpdate, [evacueeId, location], (err2, result) => {
      if (err2) {
        console.error('Return evacuee UPDATE error:', err2.message);
        return res.status(500).json({ message: err2.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Evacuee not found in your assigned center' });
      }

      res.json({ message: 'Evacuee marked as returned' });
    });
  });
});

/* -------------------- ADMIN CENTERS  LOCATION HAHAHHAHA-------------------- */

app.get('/api/admin/centers', (req, res) => {
  const sql = `
    SELECT
      c.id,
      c.name,
      c.location,
      c.capacity,
      c.latitude,
      c.longitude,
      COUNT(CASE WHEN e.status = 'Active' THEN 1 END) AS totalEvacuees
    FROM centers_loc c
    LEFT JOIN evacuees e
      ON TRIM(e.evacuation_location) = TRIM(c.name)
    GROUP BY
      c.id, c.name, c.location, c.capacity, c.latitude, c.longitude
    ORDER BY c.name ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Centers SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    const centers = results.map((row) => {
      const totalEvacuees = Number(row.totalEvacuees) || 0;
      const capacity = Number(row.capacity) || 0;

      return {
        id: row.id,
        name: normalizeLocation(row.name),
        location: row.location,
        capacity,
        latitude: row.latitude,
        longitude: row.longitude,
        totalEvacuees,
        status: buildCenterStatus(totalEvacuees, capacity)
      };
    });

    res.json(centers);
  });
});

/* -------------------- ADMIN CENTER DETAILS -------------------- */

app.get('/api/admin/centers/:centerName', (req, res) => {
  const centerName = normalizeLocation(decodeURIComponent(req.params.centerName));

  const sql = `
    SELECT
      id,
      lastname,
      firstname,
      middlename,
      age,
      gender,
      phone_number,
      pwd,
      pregnant,
      evacuation_location,
      created_at,
      status,
      returned_at
    FROM evacuees
    WHERE TRIM(evacuation_location) = TRIM(?)
      AND status = 'Active'
    ORDER BY lastname ASC, firstname ASC
  `;

  db.query(sql, [centerName], (err, results) => {
    if (err) {
      console.error('Admin center details SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json(results.map(sanitizeEvacueeRow));
  });
});

/* -------------------- ADMIN SEARCH EVACUEE -------------------- */

app.get('/api/admin/search-evacuee', (req, res) => {
  const q = String(req.query.q || '').trim();

  if (!q) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  const like = `%${q}%`;

  const sql = `
    SELECT
      id,
      lastname,
      firstname,
      middlename,
      age,
      gender,
      phone_number,
      pwd,
      pregnant,
      evacuation_location,
      created_at,
      status,
      returned_at
    FROM evacuees
    WHERE
      lastname LIKE ?
      OR firstname LIKE ?
      OR middlename LIKE ?
      OR CONCAT(firstname, ' ', lastname) LIKE ?
      OR CONCAT(lastname, ' ', firstname) LIKE ?
      OR CONCAT(firstname, ' ', middlename, ' ', lastname) LIKE ?
      OR CONCAT(lastname, ', ', firstname) LIKE ?
    ORDER BY lastname ASC, firstname ASC
    LIMIT 20
  `;

  db.query(sql, [like, like, like, like, like, like, like], (err, results) => {
    if (err) {
      console.error('Admin evacuee search error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json(results.map(sanitizeEvacueeRow));
  });
});

/* -------------------- OFFICIAL SEARCH EVACUEE -------------------- */

app.get('/api/official/search-evacuee', (req, res) => {
  const username = String(req.query.username || '').trim();
  const q = String(req.query.q || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'username query param is required' });
  }

  if (!q) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  const sqlUser = `
    SELECT barangay, evacuation_location, role
    FROM users
    WHERE username = ?
    LIMIT 1
  `;

  db.query(sqlUser, [username], (err, userRows) => {
    if (err) {
      console.error('Official search user lookup error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];

    if (user.role !== 'official') {
      return res.status(403).json({ message: 'Not an official account' });
    }

    const like = `%${q}%`;
    const location = normalizeLocation(user.barangay || user.evacuation_location);

    const sql = `
      SELECT
        id,
        lastname,
        firstname,
        middlename,
        age,
        gender,
        phone_number,
        pwd,
        pregnant,
        evacuation_location,
        created_at,
        status,
        returned_at
      FROM evacuees
      WHERE TRIM(evacuation_location) = TRIM(?)
        AND (
          lastname LIKE ?
          OR firstname LIKE ?
          OR middlename LIKE ?
          OR CONCAT(firstname, ' ', lastname) LIKE ?
          OR CONCAT(lastname, ' ', firstname) LIKE ?
          OR CONCAT(firstname, ' ', middlename, ' ', lastname) LIKE ?
          OR CONCAT(lastname, ', ', firstname) LIKE ?
        )
      ORDER BY lastname ASC, firstname ASC
      LIMIT 20
    `;

    db.query(
      sql,
      [location, like, like, like, like, like, like, like],
      (err2, results) => {
        if (err2) {
          console.error('Official evacuee search error:', err2.message);
          return res.status(500).json({ message: err2.message });
        }

        res.json(results.map(sanitizeEvacueeRow));
      }
    );
  });
});

/* -------------------- OFFICIAL REPORTS -------------------- */

app.post('/api/official/reports', (req, res) => {
  const username = String(req.body.username || '').trim();
  const evacuation_location = normalizeLocation(req.body.evacuation_location);
  const report_type = String(req.body.report_type || '').trim();
  const person_name = String(req.body.person_name || '').trim();
  const details = String(req.body.details || '').trim();
  const status = String(req.body.status || '').trim() || 'Open';

  if (!username || !evacuation_location || !report_type || !details) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO reports
    (username, evacuation_location, report_type, person_name, details, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      username,
      evacuation_location,
      report_type,
      person_name || null,
      details,
      status
    ],
    (err, result) => {
      if (err) {
        console.error('Report INSERT error:', err.message);
        return res.status(500).json({ message: err.message });
      }

      res.json({ message: 'Report submitted successfully', id: result.insertId });
    }
  );
});

app.get('/api/official/reports', (req, res) => {
  const username = String(req.query.username || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'username query param is required' });
  }

  const sql = `
    SELECT
      id,
      username,
      evacuation_location,
      report_type,
      person_name,
      details,
      status,
      created_at
    FROM reports
    WHERE username = ?
    ORDER BY id DESC
  `;

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error('Reports SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json(
      results.map((row) => ({
        ...row,
        evacuation_location: normalizeLocation(row.evacuation_location)
      }))
    );
  });
});

/* -------------------- ADMIN REPORTS -------------------- */

app.get('/api/admin/reports', (req, res) => {
  const sql = `
    SELECT
      id,
      username,
      evacuation_location,
      report_type,
      person_name,
      details,
      status,
      created_at
    FROM reports
    ORDER BY created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Admin reports SELECT error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    res.json(
      results.map((row) => ({
        ...row,
        evacuation_location: normalizeLocation(row.evacuation_location)
      }))
    );
  });
});

app.put('/api/admin/reports/:id', (req, res) => {
  const reportId = req.params.id;
  const status = String(req.body.status || '').trim();

  if (!status) {
    return res.status(400).json({ message: 'status is required' });
  }

  const sql = `
    UPDATE reports
    SET status = ?
    WHERE id = ?
  `;

  db.query(sql, [status, reportId], (err, result) => {
    if (err) {
      console.error('Report UPDATE error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json({ message: 'Report status updated successfully' });
  });
});


/* -------------------- ADMIN CENTER SEARCH -------------------- */
app.get('/api/admin/center-search', (req, res) => {
  const rawName = String(req.query.name || '').trim();
  const searchName = normalizeLocation(rawName);

  if (!searchName) {
    return res.status(400).json({ message: 'name query param is required' });
  }

  const like = `%${searchName}%`;

  const sql = `
    SELECT
      c.id,
      c.name,
      c.location,
      c.capacity,
      c.latitude,
      c.longitude,
      COUNT(CASE WHEN e.status = 'Active' THEN 1 END) AS totalEvacuees
    FROM centers_loc c
    LEFT JOIN evacuees e
      ON TRIM(e.evacuation_location) = TRIM(c.name)
    WHERE c.name LIKE ? OR c.location LIKE ?
    GROUP BY c.id, c.name, c.location, c.capacity, c.latitude, c.longitude
    ORDER BY c.name ASC
    LIMIT 1
  `;

  db.query(sql, [like, like], (err, results) => {
    if (err) {
      console.error('Center search error:', err.message);
      return res.status(500).json({ message: err.message });
    }

    if (!results.length) {
      return res.json(null);
    }

    const row = results[0];
    const totalEvacuees = Number(row.totalEvacuees) || 0;
    const capacity = Number(row.capacity) || 0;

    res.json({
      id: row.id,
      name: normalizeLocation(row.name),
      location: row.location,
      capacity,
      latitude: row.latitude,
      longitude: row.longitude,
      totalEvacuees,
      status: buildCenterStatus(totalEvacuees, capacity)
    });
  });
});

/* -------------------- START SERVER -------------------- */

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});