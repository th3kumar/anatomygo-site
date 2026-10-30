import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import {startAnalytics} from '../app/analytics';
import {installCssSprings} from '../app/motion';
import '../app/ui.css';
installCssSprings();
startAnalytics(location.origin+location.pathname+location.search);
createRoot(document.getElementById('root')!).render(<Home/>);
