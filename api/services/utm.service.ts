import UtmTag from "../models/UtmTag.js";
import { UTM_TAGS_PADRAO, type UtmCategoria } from "../types/origem.types.js";

export type TagsAtivas = Record<UtmCategoria, string[]>;

/**
 * Tags de UTM ativas, lidas da coleção `utmtags` com cache curto em memória
 * (cada pagamento valida a origem; o banco não precisa ser lido toda vez).
 *
 * Esta leitura NUNCA lança erro: a doação com cartão, por exemplo, não
 * dependia do banco para validar a UTM, e não pode passar a falhar por causa
 * disso. Banco fora do ar → último cache válido ou, sem ele, as tags padrão.
 */
const CACHE_TTL_MS = 60_000;
let cache: { expiraEm: number; tags: TagsAtivas } | null = null;

export const limparCacheUtm = () => { cache = null; };

const copiaPadrao = (): TagsAtivas => ({
    SOURCE: [...UTM_TAGS_PADRAO.SOURCE],
    MEDIUM: [...UTM_TAGS_PADRAO.MEDIUM],
    CAMPAIGN: [...UTM_TAGS_PADRAO.CAMPAIGN],
});

async function lerDoBanco(): Promise<TagsAtivas> {
    const docs = await UtmTag.find({}, { categoria: 1, codigo: 1, ativo: 1, _id: 0 }).lean();
    if (docs.length === 0) {
        console.warn("[utm] coleção utmtags vazia; usando as tags padrão. Rode `npm run seed:utm` no painel.");
        return copiaPadrao();
    }
    const tags: TagsAtivas = { SOURCE: [], MEDIUM: [], CAMPAIGN: [] };
    for (const d of docs) {
        if (d.ativo && tags[d.categoria]) tags[d.categoria].push(d.codigo);
    }
    return tags;
}

export async function obterTagsAtivas({ forcar = false } = {}): Promise<TagsAtivas> {
    if (!forcar && cache && cache.expiraEm > Date.now()) return cache.tags;
    try {
        const tags = await lerDoBanco();
        cache = { expiraEm: Date.now() + CACHE_TTL_MS, tags };
        return tags;
    } catch (erro) {
        console.error("[utm] falha ao ler as tags; usando as últimas conhecidas.", erro);
        return cache?.tags ?? copiaPadrao();
    }
}

/**
 * A tag está ativa? Se não estiver no cache, relê o banco antes de dizer
 * não: uma tag acabou de ser criada no painel e o link já está no ar.
 */
export async function tagAtiva(categoria: UtmCategoria, codigo: string): Promise<boolean> {
    if ((await obterTagsAtivas())[categoria].includes(codigo)) return true;
    // Consulta pequena (poucas tags) e as rotas de pagamento já têm rate
    // limit: vale mais aceitar a tag nova na hora do que economizar a leitura.
    return (await obterTagsAtivas({ forcar: true }))[categoria].includes(codigo);
}
