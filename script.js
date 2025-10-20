// document.getElementById("fetchRoutes").addEventListener("click", fetchRoutes);

// async function fetchRoutes() {
//   try {
//     const response = await fetch("http://localhost:3000/stops"); // Fetch from our proxy

//     if (!response.ok) {
//       throw new Error(`HTTP error! Status: ${response.status}`);
//     }

//     const data = await response.json();
//     document.getElementById("output").textContent = JSON.stringify(data, null, 2);
//   } catch (error) {
//     console.error("Error fetching routes:", error);
//     document.getElementById("output").textContent = `Error: ${error.message}`;
//   }
// }


document.getElementById("fetchStops").addEventListener("click", fetchStops);

async function fetchStops() {
  try {
    const response = await fetch("http://localhost:3000/allstops");
    const data = await response.json();
    document.getElementById("output").textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    console.error("Error fetching stops:", error);
    document.getElementById("output").textContent = `Error: ${error.message}`;
  }
}