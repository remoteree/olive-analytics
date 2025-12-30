import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ShopsList from './pages/ShopsList';
import ShopDetail from './pages/ShopDetail';
import InvoicesList from './pages/InvoicesList';
import InvoiceDetail from './pages/InvoiceDetail';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ShopsList />} />
        <Route path="/shops/:shopId" element={<ShopDetail />} />
        <Route path="/invoices" element={<InvoicesList />} />
        <Route path="/invoices/:invoiceId" element={<InvoiceDetail />} />
      </Routes>
    </Layout>
  );
}

export default App;

