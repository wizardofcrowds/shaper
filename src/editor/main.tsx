import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import 'tldraw/tldraw.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);
