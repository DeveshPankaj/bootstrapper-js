const platform = window.platform;

fetch('https://api.ipify.org?format=json')
  .then((res) => res.json())
  .then((data) => {
    const fs = platform.host.getFS();
    if (!fs.existsSync('/var/log')) fs.mkdirSync('/var/log', { recursive: true });
    fs.writeFileSync('/var/log/public-ip.txt', `${data.ip}\n${new Date().toISOString()}\n`);
  })
  .catch((err) => console.error('check-public-ip: failed to fetch public IP', err));
