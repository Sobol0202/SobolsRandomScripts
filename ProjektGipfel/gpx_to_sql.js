const ns = "http://www.topografix.com/GPX/1/1";
const waypoints = document.getElementsByTagNameNS(ns, "wpt");

let sql = "CREATE TABLE waypoints (name TEXT, lat REAL, lon REAL);\n";

for (let wpt of waypoints) {
    const lat = wpt.getAttribute("lat");
    const lon = wpt.getAttribute("lon");
    const nameTag = wpt.getElementsByTagNameNS(ns, "name")[0];
    const name = nameTag ? nameTag.textContent.replace(/'/g, "''") : "NULL";
    sql += `INSERT INTO waypoints (name, lat, lon) VALUES ('${name}', ${lat}, ${lon});\n`;
}

console.log(sql);
