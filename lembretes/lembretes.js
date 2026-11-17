// Lembretes: a cada poucos segundos, confere se alguma tarefa precisa de aviso.
//
// Este arquivo é carregado DEPOIS do renderer.js e usa coisas que ele criou:
// a lista "tarefas", formatarData(), adicionarMensagem(), aplicarMudancas() e NOME_ASSISTENTE.

const ANTECEDENCIA_MINUTOS = 10; // quanto tempo antes a Nyx avisa
const INTERVALO_CONFERENCIA = 15 * 1000; // confere a cada 15 segundos
const TOLERANCIA_ATRASO = 2 * 60 * 1000; // até 2 minutos depois do horário ainda é "agora"

function enviarNotificacao(titulo, corpo) {
  // "window.nyx" só existe dentro do Electron (vem do preload.js).
  // Se abrir a página num navegador comum, só aparece a mensagem no chat.
  if (window.nyx) window.nyx.notificar(titulo, corpo);
}

function verificarLembretes() {
  const agora = Date.now();
  const avisos = [];

  for (const tarefa of tarefas) {
    if (tarefa.concluida) continue;

    const faltam = new Date(tarefa.quando).getTime() - agora; // milissegundos até a hora

    if (faltam <= 0 && !tarefa.avisouNaHora) {
      // Chegou a hora (ou já passou)
      tarefa.avisouNaHora = true;
      tarefa.avisouAntes = true;

      if (-faltam <= TOLERANCIA_ATRASO) {
        avisos.push('⏰ É agora: "' + tarefa.titulo + '"');
      } else {
        // O app estava fechado ou o PC desligado na hora marcada
        avisos.push('⚠️ Esqueceu? "' + tarefa.titulo + '" estava marcada para ' + formatarData(tarefa.quando));
      }
    } else if (faltam > 0 && faltam <= ANTECEDENCIA_MINUTOS * 60 * 1000 && !tarefa.avisouAntes) {
      // Falta pouco
      tarefa.avisouAntes = true;
      const minutos = Math.max(1, Math.round(faltam / 60000));
      avisos.push('🔔 Daqui a ' + minutos + ' min: "' + tarefa.titulo + '"');
    }
  }

  if (avisos.length === 0) return;

  aplicarMudancas(); // guarda que já avisou, para não repetir

  // No chat: uma mensagem para cada aviso
  for (const aviso of avisos) {
    adicionarMensagem(aviso, 'assistente');
  }

  // No Windows: uma notificação só (se forem várias, junta num resumo)
  if (avisos.length === 1) {
    enviarNotificacao(NOME_ASSISTENTE, avisos[0]);
  } else {
    const linhas = avisos.slice(0, 3);
    if (avisos.length > 3) linhas.push('… e mais ' + (avisos.length - 3));
    enviarNotificacao(NOME_ASSISTENTE + ': ' + avisos.length + ' lembretes', linhas.join('\n'));
  }
}

verificarLembretes(); // logo ao abrir (pega o que passou enquanto o app estava fechado)
setInterval(verificarLembretes, INTERVALO_CONFERENCIA);