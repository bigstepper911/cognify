import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { UserProvider } from './utils/UserContext'; // 

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UserProvider>   {/* <-- Wrap your app */}
      <App />
    </UserProvider>
  </React.StrictMode>
);