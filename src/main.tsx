import { render } from 'preact';
import App from './app';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

render(<App />, document.getElementById('app')!);
registerSW({ immediate: true });
