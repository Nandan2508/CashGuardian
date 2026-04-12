@echo off
echo 🚀 Starting CashGuardian Hackathon Project...

:: Start Backend
start "CashGuardian Backend" cmd /k "node server.js"

:: Start Frontend
cd dashboard
start "CashGuardian Frontend" cmd /k "npm run dev"

echo ✨ Servers are starting! 
echo 🌍 Once ready, open http://localhost:5173
pause
