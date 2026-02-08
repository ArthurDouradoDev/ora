// 1. Relógio
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

// 2. Imagem de Fundo Dinâmica (Simplificada e Robusta)
const images = [
    "https://images.unsplash.com/photo-1698822079732-501a7e06860f?q=80&w=1920&auto=format&fit=crop", // Natureza
    "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?q=80&w=1920&auto=format&fit=crop", // Igreja Névoa
];

function setBackground() {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('catholic_dash_date');
    
    let imageUrl;

    // Lógica: Se já tem imagem salva HOJE, usa ela. Se não, sorteia nova.
    if (savedDate === today && localStorage.getItem('catholic_dash_image')) {
        imageUrl = localStorage.getItem('catholic_dash_image');
        console.log("Usando imagem salva do cache.");
    } else {
        const randomIndex = Math.floor(Math.random() * images.length);
        imageUrl = images[randomIndex];
        
        // Salva para a próxima vez
        localStorage.setItem('catholic_dash_date', today);
        localStorage.setItem('catholic_dash_image', imageUrl);
        console.log("Nova imagem sorteada e salva.");
    }

    // Aplica a imagem
    document.body.style.backgroundImage = `url('${imageUrl}')`;
}

// Executa a função
setBackground();
