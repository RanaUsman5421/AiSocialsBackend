import express from 'express';
import 'dotenv/config'
import cors from 'cors';
import connectDB from './db/connectDB.js';
import authRoutes from './routes/authRoutes.js';
import usersRoute from './routes/usersRoute.js';
import facebookRoutes from './routes/facebookRoutes.js';
import instagramRoutes from './routes/instagramRoutes.js';
import threadsRoutes from './routes/threadsRoutes.js';
import morgan from "morgan";
const app = express();

connectDB();

app.use(express.json());

const allowedOrigins = [
  'http://localhost:5173',
  'https://stuck-amiable-liftoff.ngrok-free.dev'
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('CORS policy failure: origin not allowed'))
    },
  })
)

app.use(morgan());

app.use('/api/auth', authRoutes);
app.use('/api', usersRoute);
app.use('/api', facebookRoutes);
app.use('/api', instagramRoutes);
app.use('/api', threadsRoutes);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});