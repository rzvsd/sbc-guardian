import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import AccountPage from "./account/AccountPage";
import BillingPage from "./billing/BillingPage";
import UsersPage from "./admin/UsersPage";
import ScoringRulesetsPage from "./admin/ScoringRulesetsPage";
import TaxonomyReviewPage from "./admin/TaxonomyReviewPage";
import AuditPage from "./admin/AuditPage";

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

  return (
    <BrowserRouter basename={basename}>
      <nav aria-label="Primary navigation">
        <Link to="/account">Account</Link> | <Link to="/billing">Billing</Link> |{" "}
        <Link to="/admin/users">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/account" replace />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/auth/callback" element={<AccountPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/scoring" element={<ScoringRulesetsPage />} />
        <Route path="/admin/taxonomy" element={<TaxonomyReviewPage />} />
        <Route path="/admin/audit" element={<AuditPage />} />
      </Routes>
    </BrowserRouter>
  );
}
