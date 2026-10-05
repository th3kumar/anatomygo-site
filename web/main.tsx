import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import {startAnalytics} from '../app/analytics';
import '../app/globals.css';
import '../app/dark.css';
startAnalytics(location.origin+location.pathname+location.search);
createRoot(document.getElementById('root')!).render(<Home/>);
