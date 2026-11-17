// Camada de armazenamento: é o ÚNICO arquivo que sabe ONDE as tarefas ficam guardadas.
// Hoje usa o localStorage (uma "gaveta" que o Electron mantém no seu computador).
// Quando formos para o banco de dados, só este arquivo muda.

const CHAVE_TAREFAS = 'assistente-nyx:tarefas';

function carregarTarefas() {
  try {
    const guardado = localStorage.getItem(CHAVE_TAREFAS);
    if (guardado === null) return [];

    const tarefas = JSON.parse(guardado);
    return Array.isArray(tarefas) ? tarefas : [];
  } catch (erro) {
    console.error('Não consegui ler as tarefas salvas:', erro);
    return [];
  }
}

function salvarTarefas(tarefas) {
  try {
    localStorage.setItem(CHAVE_TAREFAS, JSON.stringify(tarefas));
  } catch (erro) {
    console.error('Não consegui salvar as tarefas:', erro);
  }
}