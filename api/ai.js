// ============================================================
//  Mini-servidor de IA  (Vercel Serverless Function)
//  Vive en /api/ai — el navegador le pide, y ÉL habla con Claude.
//  La clave secreta NUNCA llega al navegador: se lee de una
//  variable de entorno (ANTHROPIC_API_KEY) que configuras en Vercel.
// ============================================================

// Modelo vigente. Haiku es rápido y barato, ideal para pulir comentarios.
// Si quieres más calidad puedes cambiarlo por 'claude-sonnet-5'.
const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  // Permitir que la página (aunque corra en otro origen, ej. Live Server) le hable
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel' });

  try {
    const { mode, text, quote, comments, doc } = req.body || {};
    let system, user;

    if (mode === 'optimize') {
      // Pulir UN comentario dictado por voz, sin cambiar el fondo
      system =
        'Eres un asistente que ayuda a un profesor a pulir la redacción de un comentario de ' +
        'retroalimentación para un estudiante. El comentario fue dictado por voz, así que puede ' +
        'tener muletillas (eee, mmm, o sea), repeticiones o frases sueltas. Devuelve el mismo ' +
        'comentario reescrito de forma clara, profesional y concisa, conservando la idea, el tono ' +
        'y el criterio del profesor. Si el profesor repite la MISMA idea varias veces, condénsala ' +
        'en UNA sola formulación clara (no la repitas); elimina redundancias, pero conserva todas ' +
        'las ideas realmente distintas. No agregues contenido nuevo, no cambies el fondo, no ' +
        'suavices ni endurezcas la crítica. Responde SOLO con el comentario reescrito, sin comillas ' +
        'ni explicaciones.';
      user =
        (quote ? `Pasaje del alumno comentado: "${quote}".\n\n` : '') +
        `Comentario en bruto del profesor: "${text}"`;

    } else if (mode === 'consolidate') {
      // Redactar el párrafo-resumen final para el alumno
      system =
        'Tu tarea es CONSOLIDAR y ordenar en un texto breve ÚNICAMENTE las observaciones que el ' +
        'profesor ya escribió sobre el trabajo del estudiante. Reglas estrictas: NO agregues ' +
        'opiniones, elogios ni aspectos positivos que el profesor no haya mencionado explícitamente; ' +
        'NO suavices ni endurezcas; NO inventes absolutamente nada. Si el profesor solo señaló ' +
        'problemas, el resumen refleja solo esos problemas. Escribe 1 a 3 frases que sinteticen con ' +
        'fidelidad lo que el profesor dijo, dirigiéndote al estudiante de tú. Responde SOLO con el ' +
        'texto, sin títulos ni comillas.';
      const lista = (comments || [])
        .map((c) => `- (sobre "${c.quote}") ${c.text}`)
        .join('\n');
      user = `Trabajo: ${doc || 'ensayo del alumno'}.\n\nComentarios del profesor:\n${lista}`;

    } else {
      return res.status(400).json({ error: 'mode debe ser "optimize" o "consolidate"' });
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || 'Error de la IA' });
    }
    const out = (data.content && data.content[0] && data.content[0].text) || '';
    return res.status(200).json({ text: out.trim() });

  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
