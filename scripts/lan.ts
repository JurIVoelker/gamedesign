import { networkInterfaces } from "os";

function getLocalIp(): string | undefined {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
}

const ip = getLocalIp();

console.log("\n=== LAN Dev Mode ===");
if (ip) {
  console.log(`  Frontend : http://${ip}:8080`);
  console.log(`  Backend  : ws://${ip}:3001`);
} else {
  console.log("  Could not detect local IP address.");
}
console.log("====================\n");
