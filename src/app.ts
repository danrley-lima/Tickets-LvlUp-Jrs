import bcrypt from 'bcrypt';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as mysql from 'mysql2/promise';

function createConnection() {
  return mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root_password',
    database: 'tickets',
  });
}

const app = express();

app.use(express.json());

const unprotectedRoutes = [
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/customers/register' },
  { method: 'POST', path: '/partners/register' },
  { method: 'GET', path: '/events' },
];

app.use(async (req, res, next) => {
  const isUnprotectedRoute = unprotectedRoutes.some(
    (route) => route.method == req.method && req.path.startsWith(route.path)
  );

  if (isUnprotectedRoute) {
    return next();
  }

  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'No Token Provided' });
    return;
  }
  try {
    const payload = jwt.verify(token, '123456') as {
      id: number;
      email: string;
    };

    const connection = await createConnection();
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM users WHERE id = ?',
      [payload.id]
    );
    const user = rows.length ? rows[0] : null;
    if (!user) {
      res.status(401).json({ message: 'Failed to Authenticate Token' });
      return;
    }
    req.user = user as { id: number; email: string };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Failed to Authenticate Token' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    const user = rows.length ? rows[0] : null;
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
        },
        '123456',
        {
          expiresIn: '1h',
        }
      );
      res.status(200).json({ token });
    } else {
      res.status(401).json({ message: 'Invalid Credentials' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.post('/customers/register', async (req, res) => {
  const { name, email, password, address, phone } = req.body;

  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (rows.length > 0) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const [userResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    const userId = userResult.insertId;

    const [customerResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO customers (user_id, address, phone) VALUES (?, ?, ?)',
      [userId, address, phone]
    );

    res.status(201).json({
      id: customerResult.insertId,
      user_id: userId,
      name,
      email,
      address,
      telefone: phone,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.post('/partners/register', async (req: Request, res: Response) => {
  const { name, email, password, company_name: companyName } = req.body;
  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (rows.length > 0) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const [userResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    const userId = userResult.insertId;

    const [partnerResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO partners (user_id, company_name) VALUES (?, ?)',
      [userId, companyName]
    );

    res.status(201).json({
      id: partnerResult.insertId,
      userId,
      name,
      email,
      company_name: companyName,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.post('/partners/events', async (req, res) => {
  const { name, description, date, location } = req.body;
  const userId = req.user!.id;

  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM partners WHERE user_id = ?',
      [userId]
    );

    const partner = rows.length ? rows[0] : null;

    if (!partner) {
      res.status(403).json({ message: 'Not Authorized' });
      return;
    }

    const eventDate = new Date(date);

    const [eventResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO events (name, description, date, location, partner_id) VALUES (?, ?, ?, ?, ?)',
      [name, description, eventDate, location, partner.id]
    );

    res.status(201).json({
      id: eventResult.insertId,
      description,
      eventDate,
      location,
      partner_id: partner.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.get('/partners/events', async (req, res) => {
  const userId = req.user!.id;

  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM partners WHERE user_id = ?',
      [userId]
    );

    const partner = rows.length ? rows[0] : null;

    if (!partner) {
      res.status(403).json({ message: 'Not Authorized' });
      return;
    }

    const [eventRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE partner_id = ?',
      [partner.id]
    );

    res.json(eventRows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.get('/partners/events/:eventId', async (req, res) => {
  const userId = req.user!.id;
  const eventId = req.params.eventId;

  const connection = await createConnection();

  try {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM partners WHERE user_id = ?',
      [userId]
    );

    const partner = rows.length ? rows[0] : null;

    if (!partner) {
      res.status(403).json({ message: 'Not Authorized' });
      return;
    }

    const [eventRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE partner_id = ? and id = ?',
      [partner.id, eventId]
    );

    const event = eventRows ? eventRows[0] : null;

    if (!event) {
      res.status(404).json({ message: 'Event Not Found' });
    }

    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.get('/events', async (req, res) => {
  const connection = await createConnection();
  try {
    const [eventRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events'
    );

    res.json(eventRows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.get('/events/:eventId', async (req, res) => {
  const eventId = req.params.eventId;
  const connection = await createConnection();
  try {
    const [eventRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [eventId]
    );

    const event = eventRows ? eventRows[0] : null;
    if (!event) {
      res.status(404).json({ message: 'Event Not Found' });
    }
    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await connection.end();
  }
});

app.listen(3000, async () => {
  const connection = await createConnection();

  // Reseta dados no banco
  connection.execute('SET FOREIGN_KEY_CHECKS = 0');
  connection.execute('TRUNCATE TABLE users');
  connection.execute('TRUNCATE TABLE events');
  connection.execute('TRUNCATE TABLE partners');
  connection.execute('TRUNCATE TABLE customers');
  connection.execute('SET FOREIGN_KEY_CHECKS = 1');

  console.log('Server is running on port 3000');
});
