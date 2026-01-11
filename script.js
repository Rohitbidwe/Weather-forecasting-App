// --- API Configuration (No Keys Needed) ---
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AQI_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

// --- DOM Elements ---
const cityInput = document.getElementById('city-input');
const locationBtn = document.getElementById('location-btn');
const recentDropdown = document.getElementById('recent-dropdown');
const unitToggle = document.getElementById('unit-toggle');
const statusMsg = document.getElementById('status-msg');
const glowEffect = document.getElementById('ambient-glow');
const body = document.getElementById('app-body');

// --- State Variables ---
let isCelsius = false; // Default to Fahrenheit
let currentTempC = 0;

// --- Event Listeners ---
cityInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchCity(cityInput.value) });
locationBtn.addEventListener('click', useCurrentLocation);
unitToggle.addEventListener('click', toggleUnits);

cityInput.addEventListener('focus', () => {
    renderHistory();
    recentDropdown.classList.remove('hidden');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!cityInput.contains(e.target) && !recentDropdown.contains(e.target)) {
        recentDropdown.classList.add('hidden');
    }
});

// --- Core Functions ---

async function searchCity(query) {
    if (!query) return;
    showStatus('Searching...');
    
    try {
        // 1. Get Lat/Lon
        const geoRes = await fetch(`${GEOCODING_URL}?name=${query}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) throw new Error('City not found');

        const { latitude, longitude, name, country } = geoData.results[0];
        saveHistory(name);
        fetchAllData(latitude, longitude, name, country);

    } catch (error) {
        showError(error.message);
    }
}

async function useCurrentLocation() {
    showStatus('Locating...');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                // 2. Reverse Geocode for City Name
                const revRes = await fetch(`${REVERSE_GEO_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
                const revData = await revRes.json();
                const name = revData.city || revData.locality || "Your Location";
                const country = revData.countryName || "";
                
                fetchAllData(latitude, longitude, name, country);
            } catch (e) {
                fetchAllData(latitude, longitude, "Current Location", "");
            }
        }, () => showError('Permission denied'));
    } else {
        showError('Geolocation not supported');
    }
}

async function fetchAllData(lat, lon, cityName, country) {
    showStatus('Updating...');
    
    // 3. Fetch Weather & AQI in Parallel
    // Weather: Get temp, humidity, wind, weather code, and daily forecast
    const weatherQuery = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    // AQI: Get US AQI index
    const aqiQuery = `${AQI_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi`;

    try {
        const [weatherRes, aqiRes] = await Promise.all([
            fetch(weatherQuery),
            fetch(aqiQuery)
        ]);

        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        
        updateUI(weatherData, aqiData, cityName, country);
        statusMsg.classList.add('hidden');
        recentDropdown.classList.add('hidden');
        cityInput.value = '';

    } catch (error) {
        console.error(error);
        showError("Data unavailable");
    }
}

// --- UI Logic ---

function updateUI(wData, aData, city, country) {
    const current = wData.current;
    const daily = wData.daily;
    const aqi = aData.current.us_aqi;

    // 1. Header Info
    document.getElementById('city-name').innerText = city;
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    
    // 2. Main Temp
    currentTempC = current.temperature_2m;
    updateTempDisplay();

    // 3. Stats
    document.getElementById('wind-speed').innerText = `${current.wind_speed_10m} km/h`;
    document.getElementById('humidity').innerText = `${current.relative_humidity_2m}%`;
    updateAQIDisplay(aqi);

    // 4. Weather Condition & Theme
    const wmo = current.weather_code;
    const info = getWeatherInfo(wmo);
    document.getElementById('weather-desc').innerText = info.desc;
    
    const mainIcon = document.getElementById('bg-icon');
    mainIcon.className = `fa-solid ${info.icon} absolute -bottom-10 -right-10 text-[18rem] text-white/5 blur-sm transition-all duration-700 group-hover:scale-110 group-hover:rotate-12`;
    
    applyTheme(info.theme);

    // 5. Forecast List
    const forecastContainer = document.getElementById('forecast-container');
    forecastContainer.innerHTML = ''; 

    for (let i = 1; i <= 5; i++) {
        const dateStr = daily.time[i];
        const max = Math.round(daily.temperature_2m_max[i]);
        const min = Math.round(daily.temperature_2m_min[i]);
        const code = daily.weather_code[i];
        const fInfo = getWeatherInfo(code);
        
        const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

        const div = document.createElement('div');
        div.className = "forecast-item";
        div.style.animationDelay = `${i * 100}ms`;
        div.innerHTML = `
            <span class="w-12 font-medium">${dayName}</span>
            <div class="flex-1 flex justify-center text-blue-300 text-lg">
                <i class="fa-solid ${fInfo.icon}"></i>
            </div>
            <div class="w-24 text-right text-sm">
                <span class="font-bold">${max}°</span> 
                <span class="text-white/40 ml-1">${min}°</span>
            </div>
        `;
        forecastContainer.appendChild(div);
    }
}

// --- Helpers ---

function updateAQIDisplay(value) {
    const elValue = document.getElementById('aqi-value');
    const elStatus = document.getElementById('aqi-status');
    const elIcon = document.getElementById('aqi-icon');
    const elBg = document.getElementById('aqi-bg');

    elValue.innerText = value;
    let status = "Good";
    let colorClass = "text-green-400";
    let bgClass = "bg-green-500/20";

    if (value > 50 && value <= 100) {
        status = "Moderate";
        colorClass = "text-yellow-400";
        bgClass = "bg-yellow-500/20";
    } else if (value > 100 && value <= 150) {
        status = "Unhealthy";
        colorClass = "text-orange-400";
        bgClass = "bg-orange-500/20";
    } else if (value > 150) {
        status = "Dangerous";
        colorClass = "text-red-500";
        bgClass = "bg-red-500/20";
    }

    elStatus.innerText = status;
    elIcon.className = `fa-solid fa-lungs ${colorClass}`;
    elBg.className = `absolute inset-0 blur-xl transition-colors duration-500 ${bgClass}`;
}

function getWeatherInfo(code) {
    if (code === 0) return { desc: "Clear Sky", icon: "fa-sun", theme: "bg-clear" };
    if (code >= 1 && code <= 3) return { desc: "Partly Cloudy", icon: "fa-cloud-sun", theme: "bg-cloudy" };
    if (code >= 45 && code <= 48) return { desc: "Foggy", icon: "fa-smog", theme: "bg-cloudy" };
    if (code >= 51 && code <= 67) return { desc: "Rainy", icon: "fa-cloud-rain", theme: "bg-rain" };
    if (code >= 71 && code <= 77) return { desc: "Snowfall", icon: "fa-snowflake", theme: "bg-snow" };
    if (code >= 95) return { desc: "Thunderstorm", icon: "fa-bolt", theme: "bg-thunder" };
    return { desc: "Unknown", icon: "fa-cloud", theme: "bg-cloudy" };
}

function applyTheme(themeClass) {
    body.className = `antialiased text-white min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-1000 ease-in-out ${themeClass}`;
    if(themeClass === 'bg-clear') glowEffect.className = "absolute top-[-20%] left-[-20%] w-[80vw] h-[80vw] bg-orange-500/30 rounded-full blur-[120px] mix-blend-screen animate-pulse-slow";
    else if(themeClass === 'bg-rain') glowEffect.className = "absolute top-[-20%] left-[-20%] w-[80vw] h-[80vw] bg-blue-800/40 rounded-full blur-[120px] mix-blend-screen animate-pulse-slow";
    else glowEffect.className = "absolute top-[-20%] left-[-20%] w-[80vw] h-[80vw] bg-blue-500/30 rounded-full blur-[120px] mix-blend-screen animate-pulse-slow";
}

function updateTempDisplay() {
    const tempEl = document.getElementById('temperature');
    if (isCelsius) {
        tempEl.innerText = Math.round(currentTempC);
        unitToggle.innerText = "C";
    } else {
        tempEl.innerText = Math.round((currentTempC * 9/5) + 32);
        unitToggle.innerText = "F";
    }
}

function toggleUnits() {
    isCelsius = !isCelsius;
    updateTempDisplay();
}

function saveHistory(city) {
    let history = JSON.parse(localStorage.getItem('futureWeatherHistory')) || [];
    if(!history.includes(city)) {
        history.unshift(city);
        if(history.length > 5) history.pop();
        localStorage.setItem('futureWeatherHistory', JSON.stringify(history));
    }
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('futureWeatherHistory')) || [];
    recentDropdown.innerHTML = '';
    if (history.length === 0) return;
    history.forEach(city => {
        const div = document.createElement('div');
        div.className = "px-4 py-3 hover:bg-white/10 cursor-pointer text-white/80 border-b border-white/5 last:border-none text-sm transition-colors";
        div.innerText = city;
        div.onclick = () => searchCity(city);
        recentDropdown.appendChild(div);
    });
}

function showStatus(msg) {
    statusMsg.innerText = msg;
    statusMsg.classList.remove('hidden');
}

function showError(msg) {
    statusMsg.innerText = `⚠️ ${msg}`;
    statusMsg.classList.remove('hidden');
    setTimeout(() => statusMsg.classList.add('hidden'), 3000);
}
