document.getElementById("factureForm").addEventListener("submit", function(e) {
  e.preventDefault();

  let client = document.getElementById("client").value;
  let service = document.getElementById("service").value;
  let montant = document.getElementById("montant").value;
  let statut = document.getElementById("statut").value;

  let date = new Date().toLocaleDateString();

  let recu = `
    <h2>REÇU DE PAIEMENT</h2>
    <p><strong>Client :</strong> ${client}</p>
    <p><strong>Service :</strong> ${service}</p>
    <p><strong>Montant :</strong> ${montant} FCFA</p>
    <p><strong>Statut :</strong> ${statut}</p>
    <p><strong>Date :</strong> ${date}</p>
    <hr>
    <p><strong>PRIMO SOLUTION</strong></p>
  `;

  document.getElementById("recu").innerHTML = recu;
});