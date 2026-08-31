import ProductionApp from '../../extension/src/guardian/ProductionApp.jsx';
import { createPreviewAdapter } from './previewAdapter.js';

const previewAdapter = createPreviewAdapter();

export default function App() {
  return <ProductionApp runtimeAdapter={previewAdapter} />;
}
