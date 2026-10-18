import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CanvasProvider } from './application/CanvasProvider';
import { createPorts } from './adapters/createPorts';
import './styles/tokens.css';
import './styles/global.css';
import { initializeTheme } from './application/theme';
import { initializeLanguage } from './application/i18n';

initializeTheme();
initializeLanguage();
const ports = createPorts();
createRoot(document.getElementById('root')!).render(<StrictMode><CanvasProvider ports={ports}><App /></CanvasProvider></StrictMode>);
