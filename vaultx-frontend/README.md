# VaultX Secure — Frontend

Modern, highly responsive React frontend for the VaultX Secure file and identity management backend. Built using Vite, React 18, and Tailwind CSS.

## 🚀 Technical Highlights
- **Architecture**: React + Vite SPA.
- **State Management**: Zustand for fast, secure client-side state (Auth & Theme settings). React Query (TanStack) for robust server-state caching and auto-refetching.
- **Security**: JWT tokens are securely rotated automatically via Axios interceptors handling HttpOnly cookies. Client-side routing enforces authentication state strictly.
- **UI/UX**: Extensive use of Tailwind CSS v4 for a premium aesthetic ("glassmorphism", micro-animations). Components are responsive and seamlessly handle both light and dark mode toggles.
- **Forms**: Strictly typed complex form validation powered by React Hook Form & Zod, supporting complex password policy checks.

## 📦 File Layout
```text
vaultx-frontend/
├── src/
│   ├── api/            # Pre-configured Axios instances with security interceptors
│   ├── components/     # Layouts (Sidebar, Topbar) and Models (ShareModal)
│   ├── pages/          # Full route pages (Dashboard, Auth flows, IDCards, etc.)
│   ├── store/          # Zustand memory stores (useAuthStore, useThemeStore)
│   └── App.jsx         # App router configuration
└── vite.config.js      # Vite compilation configuration
```

## 🚥 Getting Started

### Prerequisites
- Node.js (v18+)
- Backend API must be running (refer to the backend's README).

### 1. Installation
Run from within the `vaultx-frontend` directory:
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file at the root of `vaultx-frontend`:
```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Start Development Server
```bash
npm run dev
```
Vite will start up rapidly and hot-reload changes. Open the displayed URL in your browser.

## 🎨 Theme Customization
All base colors are controlled via Tailwind CSS v4 `@theme` overrides in `src/index.css`.

- **Primary Colors**: Indigo spectrum
- **Accent Colors**: Teal spectrum
- **Dark Mode**: Configured via the `dark:` utility modifier, toggled by users on the dashboard, and persisted to `localStorage` via Zustand.
