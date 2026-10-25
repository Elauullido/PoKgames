/* Base de validación para intercambios. No transfiere objetos por sí solo. */
G.Trade = (() => {
  const cleanCoins = value => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000)
      throw new Error('La cantidad de Coins no es válida.');
    return n;
  };
  const cleanDex = value => {
    const dex = Number(value);
    if (!Number.isSafeInteger(dex) || dex < 1 || !G.DEX_BY[dex])
      throw new Error('El Pokémon seleccionado no es válido.');
    return dex;
  };
  function createOffer({ fromUid, toUid, coins = 0, pokemonDex = null }) {
    if (!fromUid || !toUid || fromUid === toUid)
      throw new Error('Debes elegir a otro jugador.');
    return Object.freeze({
      fromUid: String(fromUid), toUid: String(toUid),
      coins: cleanCoins(coins),
      pokemonDex: pokemonDex == null || pokemonDex === '' ? null : cleanDex(pokemonDex),
      createdAt: Date.now(), status: 'pending'
    });
  }
  function validateAgainstSave(offer, save = G.DB && G.DB.save) {
    if (!save) throw new Error('No hay una partida cargada.');
    if (G.DB && G.DB.guest) throw new Error('Las cuentas invitadas no pueden intercambiar.');
    if (offer.coins > Number(save.coins || 0))
      throw new Error('No tienes suficientes Coins para esa oferta.');
    if (offer.pokemonDex != null && !save.owned?.[offer.pokemonDex])
      throw new Error('No tienes ese Pokémon en tu colección.');
    return true;
  }
  // La transferencia real debe hacerse en servidor mediante transacción atómica.
  return { createOffer, validateAgainstSave };
})();
