/* ============ redeem-codes.js — catálogo editable de códigos ============
 * Recompensas admitidas:
 *   coins: Pokémonedas · ticket1 / ticket10: tickets de gacha
 *   pokemon: números dex (p. ej. [25]) o 'all'
 *   shiny: números dex o 'all'
 *   items: mint, cap, caph (Menta, Cápsula Habilidad, Cápsula Habilidad Oculta)
 *   tms: id de movimiento (p. ej. { thunderbolt: 3 })
 * Plantilla: { id: 'mi-codigo', code: 'FELIZ-DIA', rewards: { coins: 250, ticket1: 3, pokemon: [25] } }
 * El código admin sólo se canjea con el email admin de Google. Sigue siendo código cliente: no es un secreto frente a
 * quien inspeccione este repositorio público.
 */
G.REDEEM_CODES = {
  adminEmail: 'elauullido@gmail.com',
  list: [
    { id: 'welcome-2026', code: 'POK-START-2026', rewards: { coins: 1500, ticket1: 5, ticket10: 1, items: { mint: 2 } } },
    { id: 'One', code: 'HALLOWEEN-2026', rewards: { coins: 2000, ticket1: 10, ticket10: 1, items: { mint: 2 } } },
    { id: '', code: '', rewards: {  } },
    { id: 'Oro', code: 'ORO', rewards: { coins: 1000.000.000.000 } },
    { id: 'admin-god', code: 'ELAU-ADMIN-7XQ4-92LM', admin: true }
  ]
};
