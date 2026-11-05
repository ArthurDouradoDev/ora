/* Isolated prototype: no extension storage or network API calls.
   UI copy is routed through t(); prayer content is shared with v1. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const D = window.ORA_DATA;
  const E = window.ORA_REZAR_EDITORIAL;
  let artStyle='pintura', quoteMode='salva';
  const P = Object.fromEntries(D.prayers.map(p => [p.id, p]));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const COPY = {
    'home.title':'Rezar', 'home.kicker':'Um tempo com Deus', 'home.intro':'Retome sua oração ou encontre um caminho para hoje.',
    'search.label':'Buscar orações', 'search.submit':'Buscar na Biblioteca', 'search.placeholder':'Buscar orações na Biblioteca',
    'search.clear':'Limpar busca', 'search.filters':'Filtros', 'search.categories':'Categorias da Biblioteca', 'search.all':'Todas', 'search.favs':'Favoritos',
    'search.count':'{n} orações', 'search.one':'1 oração', 'search.result':'{n} resultados', 'search.resultOne':'1 resultado',
    'search.scopeAll':'Busca em títulos e textos de todo o acervo.', 'search.scope':'Busca em títulos e textos · categoria: {cat}.',
    'search.scopeFav':'Busca apenas nas suas orações favoritas.', 'search.empty':'Nenhuma oração encontrada',
    'search.recover':'Tente outra palavra, escolha outra categoria ou volte ao acervo completo.', 'search.reset':'Ver todo o acervo',
    'resume.title':'Continuar', 'resume.hint':'De onde você parou', 'resume.action':'Continuar', 'resume.restart':'Do início',
    'resume.reading':'Leitura · {percent}% · {date}', 'resume.rosary':'Terço · mistérios {mys}', 'resume.noDate':'',
    'resume.rosaryPosition':'{part} · {prayer}', 'resume.saved':'Posição guardada. Você pode continuar depois.',
    'resume.restored':'Continuando de onde você parou.', 'resume.complete':'Terço concluído.',
    'fav.title':'Seus favoritos', 'fav.all':'Ver todos ({n})', 'fav.empty':'Suas escolhas ficam aqui. Abra uma oração e toque na estrela para favoritar.',
    'fav.add':'Adicionar aos favoritos', 'fav.remove':'Remover dos favoritos', 'fav.added':'Oração adicionada aos favoritos.', 'fav.removed':'Oração removida dos favoritos.',
    'essential.title':'Orações essenciais', 'essential.hint':'Uma seleção do Ora',
    'today.title':'Para hoje', 'today.date':'Quarta-feira · 28 de outubro · cenário do protótipo', 'today.gospel':'Evangelho · Festa dos apóstolos',
    'today.gospelDesc':'Jesus passa a noite em oração e escolhe os Doze.', 'today.read':'Ler o Evangelho', 'today.lectio':'Lectio Divina',
    'today.rosary':'Terço de hoje', 'today.mysteries':'Mistérios gloriosos', 'today.prepare':'Preparar terço', 'today.saint':'Santos do dia: São Simão e São Judas, apóstolos.',
    'library.open':'Explorar a Biblioteca', 'library.hint':'Todas as orações, categorias e seus favoritos.', 'library.kicker':'Encontre sua oração', 'library.title':'Biblioteca',
    'nav.back':'Voltar', 'reader.options':'Opções de leitura', 'reader.prayer':'Oração · {cat}', 'reader.minutes':'{n} min',
    'reader.gospel':'Evangelho do dia', 'reader.old':'Evangelho · conteúdo de 27/10',
    'reader.translation':'Tradução do protótipo para fins de teste de leitura.',
    'reader.unavailable':'O Evangelho deste dia ainda não foi baixado.', 'reader.cached':'Exibindo o último disponível: terça-feira, 27/10. Estado de teste sem conexão.',
    'reader.retry':'Tentar de novo', 'reader.offline':'Ainda sem conexão no cenário de teste.',
    'storage.fail':'Não foi possível salvar neste navegador. A posição atual ficará disponível apenas enquanto esta página estiver aberta.',
    'lectio.note':'Anotação pessoal (opcional)', 'lectio.toGuide':'Orientação', 'lectio.toText':'Texto bíblico',
    'lectio.step':'Etapa {n} de 4', 'lectio.next':'Próxima etapa', 'lectio.previous':'Anterior', 'lectio.finish':'Concluir', 'lectio.done':'Lectio concluída.',
    'lectio.ctx':'Lectio Divina · Lc 6,12-19',
    'resp.title':'Respiro', 'resp.heading':'Como você quer rezar?', 'resp.invite':'Uma pausa para estar com Deus, no seu ritmo.', 'resp.start':'Começar',
    'resp.brief':'Oração breve', 'resp.briefDesc':'Reze o Pai-Nosso com calma.', 'resp.decade':'Uma dezena', 'resp.decadeDesc':'Pai-Nosso, dez Ave-Marias e Glória.',
    'resp.free':'Oração livre', 'resp.freeDesc':'Converse com Deus com suas palavras.', 'resp.freeText':'Permaneça um pouco. Agradeça, peça ou simplesmente fique em silêncio.',
    'resp.chooseAgain':'Escolher outra prática', 'resp.next':'Próxima', 'resp.finish':'Concluir oração', 'resp.return':'Voltar ao que estava fazendo',
    'resp.amen':'Amém.', 'resp.count':'{n} de {total}', 'resp.ourFather':'Pai-Nosso', 'resp.hailMary':'Ave-Maria · {n} de 10', 'resp.glory':'Glória ao Pai',
    'cat.basic':'Básicas', 'cat.protection':'Proteção', 'cat.work':'Trabalho e estudo', 'cat.day':'Ao longo do dia', 'cat.other':'Outras',
  };
  Object.assign(COPY, {
    'home.kicker':'ORAÇÕES E LEITURAS', 'home.intro':'Um momento de recolhimento, no seu ritmo.',
    'home.closing':'Permaneça um pouco. Sem pressa.',
    'today.date':'Quarta-feira, 28 de outubro', 'today.gospel':'Evangelho · Festa dos apóstolos',
    'today.reference':'Lucas 6,12–19', 'today.gospelDesc':'Jesus passa a noite em oração e escolhe os Doze.',
    'today.liturgy':'Liturgia completa', 'today.otherWays':'Outras formas de oração e santos do dia',
    'today.practices':'Práticas de oração', 'today.rosary':'Rezar o terço', 'today.mysteries':'Mistérios gloriosos',
    'resp.invite':'Uma oração breve para este momento.',
    'library.open':'Explorar a Biblioteca',
    'personal.title':'Suas orações', 'personal.essential':'Essenciais do Ora', 'personal.favorites':'Suas favoritas',
    'fav.choose':'Escolher favoritas', 'fav.manage':'Editar favoritas', 'fav.chooseHint':'Toque na estrela ao lado das orações que deseja guardar.',
    'saint.label':'Santos do dia', 'saint.names':'São Simão e São Judas Tadeu', 'saint.identity':'Apóstolos de Jesus',
    'saint.portraitCaption':'São Judas Tadeu', 'saint.know':'Conhecer os apóstolos', 'saint.source':'Fonte da citação',
    'nav.newTab':' (abre em nova aba)', 'nav.close':'Fechar',
    'art.gospelAlt':'Ilustração contemplativa de Jesus em oração numa montanha à noite, antes da escolha dos Doze.',
    'art.saintAlt':'Representação devocional de São Judas Tadeu, com manto verde e medalhão de Cristo.',
    'art.about':'Sobre as imagens',
    'art.description':'As ilustrações desta tela foram criadas com IA para o Ora. Pintura e mosaico são interpretações contemporâneas, inspiradas em tradições de arte sacra.',
    'art.context':'O conteúdo acompanha a festa de São Simão e São Judas, em 28 de outubro. A frase é atribuída individualmente a São Judas Tadeu, em João 14,22, com referência à catequese de Bento XVI.',
    'art.document':'Ler a direção artística',
  });
  function t(key, params = {}) { return (COPY[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')); }
  $$('[data-i18n]').forEach(n => n.textContent = t(n.dataset.i18n));
  $$('[data-placeholder]').forEach(n => n.placeholder = t(n.dataset.placeholder));
  $$('[data-alt]').forEach(n => n.alt=t(n.dataset.alt));
  $$('[data-label]').forEach(n => n.setAttribute('aria-label',t(n.dataset.label)));
  const memory = {};
  const LS = {
    get(k, fallback = null) { if(Object.hasOwn(memory,k))return memory[k]; try { return JSON.parse(localStorage.getItem('ora-proto-rezar-v2-' + k)) ?? memory[k] ?? fallback; } catch { return memory[k] ?? fallback; } },
    set(k, value) { memory[k] = value; try { localStorage.setItem('ora-proto-rezar-v2-' + k, JSON.stringify(value)); return true; } catch { if($('#storageNotice').hidden)Proto.toast(t('storage.fail'),6000); $('#storageNotice').hidden = false; $('#storageNotice').textContent = t('storage.fail'); return false; } },
  };
  const CATS = {
    [t('cat.basic')]:['pai-nosso','ave-maria','gloria','credo','ato-contricao','salve-rainha'],
    [t('cat.protection')]:['sao-miguel','sao-bento','suplica-anjos'],
    [t('cat.work')]:['oferecimento-obras','sao-tomas-estudo','trabalho-sao-jose','vinde-espirito-santo'],
    [t('cat.day')]:['angelus','fica-senhor-comigo','sao-carlo-acutis'],
  };
  const catOf = id => Object.entries(CATS).find(([,ids]) => ids.includes(id))?.[0] || t('cat.other');
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let favs = LS.get('favs', []);
  favs = Array.isArray(favs) ? [...new Set(favs)].filter(id => P[id]) : [];
  let cat = t('search.all'), query = '', current = null;
  let readSize = Math.max(15,Math.min(28,Number(LS.get('size',19)) || 19));
  let appearance = LS.get('ap','escuro');
  let readingReady = false, readerEpoch = 0, restoreRatio = null, lectio = 0;
  let mys = 'gloriosos', textMode = 'full', rosIntent = '', steps = [], si = 0;
  let respMode = null, ri = 0, rsteps = [], respOrigin = 'rezar';
  let returnRoute = 'rezar';
  const contexts = new Map();
  const READER_STATES = ['leitor-curto','leitor-longo','leitor-evangelho','evangelho-indisponivel'];
  function validReading(r) { return r && P[r.id] && Number.isFinite(r.ratio) && r.ratio > .01 && r.ratio < .99; }
  function validRosary(r) { return r && D.mysteries[r.mys] && Number.isInteger(r.index) && r.index > 0 && r.index < 79 && ['full','name'].includes(r.textMode); }
  function dateText(time) { return Number.isFinite(time) ? new Date(time).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''; }
  function selectorFor(n) {
    if (!n || !n.closest('#app')) return null;
    if (n.id) return '#' + CSS.escape(n.id);
    for (const key of ['data-open','data-resume','data-restart','data-goto','data-cat','data-toggle-fav']) if (n.hasAttribute(key)) return `[${key}="${CSS.escape(n.getAttribute(key))}"]`;
    return null;
  }
  function focusElement(n) { if (!n || n.closest('[hidden]')) return; if (!n.matches('button,input,textarea,a,summary')) n.tabIndex = -1; n.focus({preventScroll:true}); }
  function saveReading() {
    if (!readingReady || !READER_STATES.includes(Proto.state) || current?.kind !== 'prayer') return;
    const b=$('#readerBody'), max=b.scrollHeight-b.clientHeight;
    if (max <= 4) return;
    const ratio=Math.max(0,Math.min(1,b.scrollTop/max));
    const rec={id:current.id,ratio,time:Date.now()};
    LS.set('pos-'+current.id,rec);
    if(validReading(rec))LS.set('reading',rec);
    else if(LS.get('reading')?.id===current.id)LS.set('reading',null);
  }
  function saveRosary() {
    if (!steps.length) return;
    LS.set('rosary',{mys,index:si,textMode,intention:rosIntent,time:Date.now()});
    if(history.state?.oraRezarV2 && history.state.route==='terco-oracao') history.replaceState({...history.state,context:{...history.state.context,mys,si,textMode,rosIntent}},'');
  }
  function captureContext() {
    const v=Proto.state === 'rezar' ? $('#homeView') : $('#libraryView');
    return {cat,query,current,returnRoute,focus:selectorFor(document.activeElement),scroll:v.scrollTop,
      ratio:current?.kind === 'prayer' ? LS.get('pos-'+current.id)?.ratio : 0,
      lectio,mys,textMode,rosIntent,si,respMode,ri,respOrigin};
  }
  function saveHistoryContext() {
    if (!Proto.state) return;
    const c=captureContext();contexts.set(Proto.state,c);
    if (history.state?.oraRezarV2) history.replaceState({...history.state,context:c},'');
  }
  function goBack(fallback=returnRoute) {
    if (history.state?.oraRezarV2 && history.state.depth>0) history.back();
    else Proto.setState(fallback || 'rezar');
  }
  function renderFavs() {
    const has=favs.length>0;
    // Move the actual section so reading and keyboard order match the layout.
    const personal=$('.personal-section');
    const today=$('.today-section');
    personal.classList.toggle('has-favorites',has);
    if(has) today.before(personal);
    else today.after(personal);
    $('#personalTitle').textContent=t(has?'fav.title':'essential.title');
    $('#favs').hidden=!has;$('#essentials').hidden=has;
    $('#favs').innerHTML=favs.slice(0,4).map(id=>`<button class="fav-chip" data-open="${id}"><i class="ph-fill ph-star" aria-hidden="true"></i>${esc(P[id].title)}</button>`).join('');
    $('#personalHint').textContent=t(has?'personal.favorites':'personal.essential');
    $('#chooseFavorites').textContent=t(has?'fav.manage':'fav.choose');
    $('#allFavs').hidden=favs.length<=4;$('#allFavs').textContent=t('fav.all',{n:favs.length});
  }
  function renderEditorial() {
    document.documentElement.dataset.arte=artStyle;
    function setArt(imgId,figureId,images,content,emptyClass) {
      const img=$(imgId),figure=$(figureId),surface=$(content),src=images[artStyle];
      const show=!!src;
      figure.hidden=!show;surface.classList.toggle(emptyClass,!show);
      if(!show)return;
      img.onload=()=>{if(img.getAttribute('src')===src && artStyle!=='sem-imagens'){figure.hidden=false;surface.classList.remove(emptyClass);}};
      img.onerror=()=>{if(img.getAttribute('src')===src){figure.hidden=true;surface.classList.add(emptyClass);}};
      if(img.getAttribute('src')!==src)img.src=src;
      else if(img.complete && !img.naturalWidth){figure.hidden=true;surface.classList.add(emptyClass);}
    }
    setArt('#gospelArt','#gospelFigure',E.gospel.images,'.gospel-story','no-art');
    setArt('#saintArt','#saintFigure',E.saints.images,'.saint-intro','no-portrait');
    const saved=quoteMode==='salva' ? E.quotes.find(q=>q.saintId===E.saints.portraitSaintId) : null;
    const valid=saved?.verified===true && E.saints.ids.includes(saved.saintId) && typeof saved.text==='string' && saved.text.trim() && saved.author && /^https:\/\//.test(saved.source||'');
    $('#saintQuote').hidden=!valid;
    $('#saintQuoteText').textContent=valid?'“'+saved.text+'”':'';
    $('#saintQuoteAuthor').textContent=valid?saved.author+' · '+saved.reference:'';
    if(valid){$('#saintQuoteSource').href=saved.source;$('#saintQuoteSource').title=saved.sourceLabel;}
    else $('#saintQuoteSource').removeAttribute('href');
  }
  function renderHome() {
    renderFavs();renderEditorial();
    const r=LS.get('reading'), ros=LS.get('rosary');
    const cards=[];
    if (validReading(r)) cards.push(`<article class="resume-card"><div><b>${esc(P[r.id].title)}</b><p class="meta">${t('resume.reading',{percent:Math.round(r.ratio*100),date:dateText(r.time)})}</p></div><div class="resume-actions"><button class="btn btn-primary btn-sm" data-resume="${r.id}">${t('resume.action')}</button><button class="btn btn-quiet btn-sm" data-restart="${r.id}">${t('resume.restart')}</button></div></article>`);
    if (validRosary(ros)) cards.push(`<article class="resume-card"><div><b>${t('resume.rosary',{mys:ros.mys})}</b><p class="meta">${esc(rosaryDescription(ros))}</p></div><div class="resume-actions"><button class="btn btn-primary btn-sm" data-resume="rosary">${t('resume.action')}</button><button class="btn btn-quiet btn-sm" data-goto="terco-preparacao">${t('resume.restart')}</button></div></article>`);
    $('#resumeCards').innerHTML=cards.join('');$('#resumeSection').hidden=!cards.length;
    $('#essentials').innerHTML=['pai-nosso','ave-maria','sao-miguel'].map(id=>`<button data-open="${id}"><i class="ph ph-book-open" aria-hidden="true"></i><span>${esc(P[id].title)}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`).join('');
  }
  function renderCats() {
    $('#cats').innerHTML=[t('search.all'),t('search.favs'),...Object.keys(CATS)].map(c=>`<button class="btn btn-sm btn-aux" aria-pressed="${c===cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }
  function renderList() {
    query=$('#search').value;
    const q=norm(query.trim());
    const items=D.prayers.filter(p=>(cat===t('search.all') || (cat===t('search.favs') ? favs.includes(p.id) : catOf(p.id)===cat)) && (!q || norm(p.title+' '+p.text).includes(q)));
    $('#resultCount').textContent=t(q ? (items.length===1?'search.resultOne':'search.result') : (items.length===1?'search.one':'search.count'),{n:items.length});
    $('#collectionCount').textContent=t('search.count',{n:D.prayers.length});
    $('#searchScope').textContent=t(cat===t('search.all')?'search.scopeAll':cat===t('search.favs')?'search.scopeFav':'search.scope',{cat});
    $('#clearSearch').hidden=!query;$('#noResults').hidden=!!items.length;$('#plist').hidden=!items.length;
    $('#plist').innerHTML=items.map(p=>{
      const text=p.text.replace(/\s+/g,' ');const at=q?norm(text).indexOf(q):-1;const start=Math.max(0,at-28);
      const snippet=(start?'…':'')+text.slice(start,start+105)+(text.length>start+105?'…':'');
      const favorite=favs.includes(p.id);
      return `<li class="prayer-row"><button data-open="${p.id}"><span class="tt"><b>${esc(p.title)}</b><span>${esc(snippet)}</span></span><span class="meta">${t('reader.minutes',{n:Math.max(1,Math.round(p.text.split(/\s+/).length/130))})}</span></button><button class="library-star" data-toggle-fav="${p.id}" aria-pressed="${favorite}" aria-label="${esc(t(favorite?'fav.remove':'fav.add')+': '+p.title)}"><i class="${favorite?'ph-fill':'ph'} ph-star" aria-hidden="true"></i></button></li>`;
    }).join('');
  }
  function openPrayer(id, restart=false) {
    if (!P[id]) return;
    saveReading();saveHistoryContext();
    readingReady=false;
    current={kind:'prayer',id};
    const saved=LS.get('pos-'+id);
    restoreRatio=restart ? 0 : validReading(saved) ? saved.ratio : 0;
    if (restart) { LS.set('pos-'+id,{id,ratio:0,time:Date.now()});if (LS.get('reading')?.id===id) LS.set('reading',null); }
    Proto.setState(P[id].text.length<700?'leitor-curto':'leitor-longo',{prepared:true});
  }
  function gospelHTML(g,unavailable=false) {
    return `<header><p class="label">${esc(g.ctx)}</p><h1 tabindex="-1">${esc(g.ref)}</h1></header>${unavailable?`<div class="banner warn" style="margin-bottom:2rem"><i class="ph ph-cloud-slash" aria-hidden="true"></i><div><strong>${t('reader.unavailable')}</strong><p>${t('reader.cached')}</p><div class="actions"><button class="btn btn-aux btn-sm" id="retryGospel">${t('reader.retry')}</button></div></div></div>`:''}<div class="read-col">${g.verses.map(([n,text])=>`<p><span class="verse">${n}</span>${esc(text)}</p>`).join('')}<p class="meta" style="margin-top:1.5rem;font-family:var(--f-ui)">${t('reader.translation')}</p></div>`;
  }
  function syncFav() {
    const on=current?.kind==='prayer' && favs.includes(current.id);
    $('#favBtn').hidden=current?.kind!=='prayer';$('#favBtn').setAttribute('aria-pressed',String(on));$('#favBtn').setAttribute('aria-label',t(on?'fav.remove':'fav.add'));
    $('#favBtn').innerHTML=`<i class="${on?'ph-fill':'ph'} ph-star" aria-hidden="true"${on?' style="color:var(--gold)"':''}></i>`;
  }
  function applySize() {
    document.documentElement.style.setProperty('--read-size',readSize/16+'rem');$('#sizeVal').textContent=readSize;
    $('#sizeDown').disabled=readSize<=15;$('#sizeUp').disabled=readSize>=28;
    LS.set('size',readSize);
  }
  function renderReader(state) {
    readingReady=false;const epoch=++readerEpoch;
    if (state==='leitor-evangelho' || state==='evangelho-indisponivel') {
      current={kind:'gospel',id:state==='leitor-evangelho'?'today':'old'};
      $('#readerInner').innerHTML=gospelHTML(state==='leitor-evangelho'?GOSPEL:GOSPEL_OLD,state==='evangelho-indisponivel');
      $('#readerCtx').textContent=t(state==='leitor-evangelho'?'reader.gospel':'reader.old');
    } else {
      if (!P[current?.id] || current.kind!=='prayer' || (state==='leitor-curto' && P[current.id].text.length>=700) || (state==='leitor-longo' && P[current.id].text.length<700)) current={kind:'prayer',id:state==='leitor-curto'?'ave-maria':'suplica-anjos'};
      const p=P[current.id], short=p.text.length<700;
      $('#readerCtx').textContent=p.title;
      $('#readerInner').innerHTML=`<header class="${short?'short':''}"><p class="label">${t('reader.prayer',{cat:esc(catOf(p.id))})}</p><h1 tabindex="-1">${esc(p.title)}</h1></header><div class="read-col ${short?'short':''}" id="prayerText">${p.text.split(/\n\n+/).map(text=>`<p>${esc(text)}</p>`).join('')}</div>`;
    }
    syncFav();
    const ratio=restoreRatio??(validReading(LS.get('pos-'+current.id))?LS.get('pos-'+current.id).ratio:0);restoreRatio=null;
    const ready=document.fonts?.ready || Promise.resolve();
    ready.then(()=>requestAnimationFrame(()=>{
      if (epoch!==readerEpoch || !READER_STATES.includes(Proto.state)) return;
      const b=$('#readerBody');b.style.scrollBehavior='auto';b.scrollTop=ratio*Math.max(0,b.scrollHeight-b.clientHeight);
      updateProgress();focusElement($('#readerInner h1'));
      // Wait for the scroll generated by restoration before allowing any writes.
      requestAnimationFrame(()=>{ if(epoch!==readerEpoch)return;readingReady=true;b.style.scrollBehavior=''; });
    }));
  }
  function updateProgress() {
    const b=$('#readerBody'), max=b.scrollHeight-b.clientHeight;
    $('#readerProgress').style.width=(max>0?b.scrollTop/max*100:0)+'%';saveReading();
  }
  function changeSize(delta) {
    saveReading();const b=$('#readerBody'), ratio=b.scrollTop/Math.max(1,b.scrollHeight-b.clientHeight);
    readingReady=false;readSize=Math.max(15,Math.min(28,readSize+delta));applySize();
    requestAnimationFrame(()=>{b.style.scrollBehavior='auto';b.scrollTop=ratio*Math.max(0,b.scrollHeight-b.clientHeight);requestAnimationFrame(()=>{b.style.scrollBehavior='';readingReady=READER_STATES.includes(Proto.state);});});
  }
  const LECTIO=[['Lectio','Leia o texto devagar, talvez duas vezes. Que palavra ou frase chama sua atenção?'],['Meditatio','Fique com essa palavra. O que ela diz sobre a sua vida hoje?'],['Oratio','Responda a Deus com suas palavras: agradecimento, pedido, perdão.'],['Contemplatio','Agora, apenas permaneça. Não é preciso dizer nada.']];
  function renderLectio(first=false) {
    if(first)$('#lectioText').innerHTML=gospelHTML(GOSPEL);
    $('#lectioN').textContent=t('lectio.step',{n:lectio+1});$('#lectioH').textContent=LECTIO[lectio][0];$('#lectioP').textContent=LECTIO[lectio][1];
    $('#lectioNote').hidden=!(lectio===1||lectio===2);$('#lectioNote').value=LS.get('lectio-note-'+lectio,'');
    $$('#lectioSteps span').forEach((n,i)=>n.classList.toggle('on',i<=lectio));
    $('#lectioPrev').disabled=lectio===0;$('#lectioNext').textContent=t(lectio===3?'lectio.finish':'lectio.next');
  }
  function renderMysList() {
    $('#mysList').innerHTML=D.mysteries[mys].map(m=>`<li>${esc(m)}</li>`).join('');
    $$('#mysSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===mys)));
    $$('#textSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===textMode)));
  }
  function rosaryDescription(r) {
    const keep={mys,si,steps};mys=r.mys;buildSteps();const s=steps[r.index];const description=s ? t('resume.rosaryPosition',{part:s.d===0?'Orações iniciais':s.d===6?'Conclusão':`${s.d}º mistério`,prayer:s.name}) : '';
    mys=keep.mys;si=keep.si;steps=keep.steps;return description;
  }
  function renderPrep() {
    renderMysList();$('#rosIntent').value=rosIntent;
    const r=LS.get('rosary');$('#prepResumeBanner').hidden=!validRosary(r);if(validRosary(r))$('#prepResumeText').textContent=t('resume.rosary',{mys:r.mys})+' · '+rosaryDescription(r);
  }
  function resumeRosary() {
    const r=LS.get('rosary');if(!validRosary(r))return;
    saveReading();saveHistoryContext();mys=r.mys;textMode=r.textMode;rosIntent=r.intention||'';buildSteps();si=r.index;Proto.setState('terco-oracao',{prepared:true});
  }
  function buildRespiro(mode=respMode, reset=true) {
    respMode=mode;
    if(mode==='brief')rsteps=[{name:t('resp.ourFather'),text:P['pai-nosso'].text}];
    else if(mode==='free')rsteps=[{name:t('resp.free'),text:t('resp.freeText')}];
    else if(mode==='decade')rsteps=[{name:t('resp.ourFather'),text:P['pai-nosso'].text},...Array.from({length:10},(_,i)=>({name:t('resp.hailMary',{n:i+1}),text:P['ave-maria'].text,bead:i+1})),{name:t('resp.glory'),text:P.gloria.text}];
    else rsteps=[];
    if(mode)rsteps.push({end:true,name:'',text:t('resp.amen')});
    if(reset)ri=0;
  }
  function renderRespiro() {
    $('#respChoice').hidden=!!respMode;$('#respPractice').hidden=!respMode;$('#respIntent').hidden=true;
    if(!respMode){$('#respChoices').innerHTML=[['brief','ph-book-open','resp.brief','resp.briefDesc'],['decade','ph-circles-four','resp.decade','resp.decadeDesc'],['free','ph-wind','resp.free','resp.freeDesc']].map(([id,icon,title,desc])=>`<button class="resp-choice" data-practice="${id}"><i class="ph ${icon}" aria-hidden="true"></i><span><b>${t(title)}</b><small>${t(desc)}</small></span></button>`).join('');return;}
    ri=Math.max(0,Math.min(ri,rsteps.length-1));const s=rsteps[ri];$('#respName').textContent=s.name;$('#respText').textContent=s.text;
    $('#respBeads').hidden=respMode!=='decade'||!!s.end;
    $('#respBeads').innerHTML=Array.from({length:10},(_,i)=>`<span class="bead ${i+1<(s.bead||0)?'done':''} ${i+1===s.bead?'cur':''}"><i></i></span>`).join('');
    $('#respNext').textContent=t(s.end?'resp.return':respMode!=='decade'?'resp.finish':'resp.next');
    $('#respCount').textContent=s.end||respMode!=='decade'?'':t('resp.count',{n:ri+1,total:rsteps.length-1});
    $('#respChooseAgain').hidden=!!s.end;
  }

  const GOSPEL = {
    ref: 'Lucas 6,12-19', ctx: 'Evangelho · Festa de São Simão e São Judas',
    verses: [
      [12, 'Naqueles dias, Jesus foi à montanha para orar e passou a noite inteira em oração a Deus.'],
      [13, 'Quando amanheceu, chamou seus discípulos e escolheu doze dentre eles, aos quais deu o nome de apóstolos:'],
      [14, 'Simão, a quem chamou Pedro, e André, seu irmão; Tiago e João; Filipe e Bartolomeu;'],
      [15, 'Mateus e Tomé; Tiago, filho de Alfeu, e Simão, chamado Zelota;'],
      [16, 'Judas, filho de Tiago, e Judas Iscariotes, que se tornou o traidor.'],
      [17, 'Descendo com eles, parou numa planície. Ali estavam muitos discípulos e uma grande multidão de toda a Judeia, de Jerusalém e do litoral de Tiro e de Sidônia.'],
      [18, 'Tinham vindo para ouvi-lo e ser curados de suas doenças. Os que eram atormentados por espíritos impuros também ficavam curados.'],
      [19, 'E toda a multidão procurava tocá-lo, porque dele saía uma força que curava a todos.'],
    ],
  };
  const GOSPEL_OLD = {
    ref: 'Lucas 13,18-21', ctx: 'Evangelho de terça-feira, 27 de outubro',
    verses: [
      [18, 'Jesus dizia: “A que é semelhante o Reino de Deus? Com que poderei compará-lo?'],
      [19, 'É como um grão de mostarda que um homem tomou e semeou em sua horta. Ele cresceu, tornou-se árvore, e as aves do céu fizeram ninhos em seus ramos.”'],
      [20, 'E disse ainda: “Com que compararei o Reino de Deus?'],
      [21, 'É como o fermento que uma mulher tomou e misturou em três medidas de farinha, até que tudo ficasse fermentado.”'],
    ],
  };

  const ORD = ['1º', '2º', '3º', '4º', '5º'];
  const MYS_LABEL = { gozosos: 'gozoso', dolorosos: 'doloroso', gloriosos: 'glorioso', luminosos: 'luminoso' };
  function buildSteps() {
    const s = [];
    const add = (o) => s.push(o);
    add({ d: 0, bead: null, name: 'Sinal da cruz', text: D.extra['sinal-cruz'] });
    add({ d: 0, bead: null, name: 'Creio', text: P.credo.text });
    add({ d: 0, bead: 0, big: true, name: 'Pai-Nosso', text: P['pai-nosso'].text });
    ['fé', 'esperança', 'caridade'].forEach((v, i) => add({ d: 0, bead: i + 1, name: `Ave-Maria · pela ${v}`, text: P['ave-maria'].text }));
    add({ d: 0, bead: 4, name: 'Glória', text: P.gloria.text });
    for (let d = 1; d <= 5; d++) {
      add({ d, bead: null, announce: true, name: 'Anúncio do mistério', text: `No ${ORD[d - 1]} mistério ${MYS_LABEL[mys]}, contemplamos:\n${D.mysteries[mys][d - 1]}.` });
      add({ d, bead: 0, big: true, name: 'Pai-Nosso', text: P['pai-nosso'].text });
      for (let a = 1; a <= 10; a++) add({ d, bead: a, name: `Ave-Maria · ${a} de 10`, text: P['ave-maria'].text });
      add({ d, bead: 11, name: 'Glória', text: P.gloria.text });
      add({ d, bead: 11, name: 'Ó meu Jesus', text: D.extra.fatima });
    }
    add({ d: 6, bead: null, name: 'Salve-Rainha', text: P['salve-rainha'].text });
    add({ d: 6, bead: null, name: 'Sinal da cruz', text: D.extra['sinal-cruz'] });
    steps = s;
  }
  function renderRosary() {
    if (!steps.length) buildSteps();
    si = Math.max(0, Math.min(si, steps.length - 1));
    saveRosary();
    const s = steps[si];
    $('#rosCtx').textContent = `Terço · Mistérios ${mys}`;
    $('#rosIntentLine').textContent = rosIntent ? rosIntent : '';
    // Barra dos mistérios
    $('#mysBar').innerHTML = [1, 2, 3, 4, 5].map((d) => `<button class="${d < s.d ? 'done' : ''} ${d === s.d ? 'cur' : ''}" data-d="${d}" aria-label="Ir para o ${ORD[d - 1]} mistério: ${esc(D.mysteries[mys][d - 1])}" title="${esc(D.mysteries[mys][d - 1])}"><span></span></button>`).join('');
    $('#mysBar').querySelectorAll('button').forEach((b) => b.onclick = () => { si = steps.findIndex((x) => x.d === +b.dataset.d && x.announce); renderRosary(); });
    // Título
    if (s.d === 0) { $('#mysLabel').textContent = 'Início'; $('#mysName').textContent = 'Orações iniciais'; }
    else if (s.d === 6) { $('#mysLabel').textContent = 'Conclusão'; $('#mysName').textContent = 'Agradecimento'; }
    else { $('#mysLabel').textContent = `${ORD[s.d - 1]} mistério ${MYS_LABEL[mys]}`; $('#mysName').textContent = D.mysteries[mys][s.d - 1]; }
    // Contas
    const count = s.d === 0 ? 5 : s.d === 6 ? 0 : 12;
    let html = '';
    for (let b = 0; b < count; b++) {
      const big = b === 0 || (s.d > 0 && b === 11) || (s.d === 0 && b === 4);
      const idx = steps.findIndex((x) => x.d === s.d && x.bead === b);
      const done = s.bead != null ? b < s.bead : false;
      const label = steps[idx]?.name || '';
      html += `<button class="bead ${big ? 'big' : ''} ${s.bead === b ? 'cur' : ''} ${done ? 'done' : ''}" data-i="${idx}" aria-label="${esc(label)}" ${s.bead === b ? 'aria-current="step"' : ''}><i></i></button>`;
      if (b === 0 || (s.d > 0 && b === 10) || (s.d === 0 && b === 3)) html += '<span class="bead-sep" aria-hidden="true"></span>';
    }
    $('#beads').innerHTML = html;
    $('#beads').querySelectorAll('.bead').forEach((b) => b.onclick = () => { si = +b.dataset.i; renderRosary(); });
    // Oração
    $('#prName').textContent = s.name;
    $('#prText').textContent = textMode === 'name' && !s.announce ? '' : s.text;
    $('#prText').style.display = textMode === 'name' && !s.announce ? 'none' : '';
    $('#rosPrev').disabled = si === 0;
    $('#rosNext').innerHTML = si === steps.length - 1 ? 'Concluir' : 'Próxima<i class="ph ph-arrow-right" aria-hidden="true"></i>';
  }

  /* Events and navigation. Controls use the version-specific history harness. */
  $('#homeSearchForm').onsubmit=e=>{e.preventDefault();query=$('#homeSearch').value;cat=t('search.all');Proto.setState('biblioteca');focusElement($('#search'));};
  $('#librarySearchForm').onsubmit=e=>e.preventDefault();
  $('#search').oninput=()=>{renderList();saveHistoryContext();};
  function clearSearch(all=false){$('#search').value='';query='';if(all)cat=t('search.all');renderCats();renderList();focusElement($('#search'));saveHistoryContext();}
  $('#clearSearch').onclick=()=>clearSearch();$('#onlyClear').onclick=()=>clearSearch();$('#resetSearch').onclick=()=>clearSearch(true);
  $('#filterToggle').onclick=()=>{const on=$('#filterPanel').classList.toggle('expanded');$('#filterToggle').setAttribute('aria-expanded',String(on));};
  $('#chooseFavorites').onclick=()=>{cat=t('search.all');query='';Proto.setState('biblioteca');Proto.toast(t('fav.chooseHint'),3500);};
  $('#artInfoOpen').onclick=()=>$('#artInfoDialog').showModal();
  $('#artInfoClose').onclick=()=>$('#artInfoDialog').close();
  $('#artInfoDialog').addEventListener('close',()=>focusElement($('#artInfoOpen')));
  $('#allFavs').onclick=()=>{cat=t('search.favs');query='';Proto.setState('biblioteca');};
  function goHome(){Proto.setState('rezar',{returnContext:contexts.get('rezar')});}
  $('#libraryBack').onclick=goHome;$('#readerBack').onclick=()=>goBack();$('#prepBack').onclick=goHome;
  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-toggle-fav]');
    if(toggle && P[toggle.dataset.toggleFav]){
      const id=toggle.dataset.toggleFav,on=favs.includes(id);
      favs=on?favs.filter(x=>x!==id):[...favs,id];LS.set('favs',favs);renderList();
      focusElement($(`[data-toggle-fav="${CSS.escape(id)}"]`) || $('#search'));
      Proto.toast(t(on?'fav.removed':'fav.added'));saveHistoryContext();return;
    }

    const o=e.target.closest('[data-open]');if(o)openPrayer(o.dataset.open);
    const r=e.target.closest('[data-resume]');if(r){if(r.dataset.resume==='rosary')resumeRosary();else openPrayer(r.dataset.resume);}
    const restart=e.target.closest('[data-restart]');if(restart)openPrayer(restart.dataset.restart,true);
    const c=e.target.closest('[data-cat]');if(c){cat=c.dataset.cat;renderCats();renderList();focusElement($(`[data-cat="${CSS.escape(cat)}"]`));saveHistoryContext();}
    const practice=e.target.closest('[data-practice]');if(practice){buildRespiro(practice.dataset.practice);renderRespiro();focusElement($('#respNext'));saveHistoryContext();}
    if(e.target.closest('#retryGospel'))Proto.toast(t('reader.offline'));
  });
  $('#favBtn').onclick=()=>{
    if(current?.kind!=='prayer')return;
    const on=favs.includes(current.id);favs=on?favs.filter(id=>id!==current.id):[...favs,current.id];
    LS.set('favs',favs);syncFav();Proto.toast(t(on?'fav.removed':'fav.added'));
  };
  $('#sizeDown').onclick=()=>changeSize(-1);$('#sizeUp').onclick=()=>changeSize(1);
  $$('[data-ap]').forEach(b=>b.onclick=()=>{appearance=b.dataset.ap;applyAppearance();LS.set('ap',appearance);});
  function applyAppearance(){ $('#reader').classList.toggle('paper',appearance==='papel');$$('[data-ap]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ap===appearance))); }
  $('#readerBody').addEventListener('scroll',updateProgress,{passive:true});
  function scrollLectioTo(target) {
    const pane=wasNarrow ? $('.lectio') : target.closest('.lectio-guide') || $('#lectioBody');
    const reserve=wasNarrow ? $('.lectio-access').offsetHeight+16 : 16;
    pane.scrollTo({top:Math.max(0,pane.scrollTop+target.getBoundingClientRect().top-pane.getBoundingClientRect().top-reserve),behavior:'instant'});
  }
  $('#lectioPrev').onclick=()=>{lectio=Math.max(0,lectio-1);renderLectio();focusElement($('#lectioH'));scrollLectioTo($('#lectioH'));saveHistoryContext();};
  $('#lectioNext').onclick=()=>{if(lectio===3){goBack();Proto.toast(t('lectio.done'));return;}lectio++;renderLectio();focusElement($('#lectioH'));scrollLectioTo($('#lectioH'));saveHistoryContext();};
  $('#lectioNote').oninput=()=>LS.set('lectio-note-'+lectio,$('#lectioNote').value);
  $('#lectioJump').onclick=()=>{scrollLectioTo($('#lectioH'));focusElement($('#lectioH'));};
  $('#lectioReturn').onclick=()=>{scrollLectioTo($('#lectioText h1'));focusElement($('#lectioText h1'));};
  $$('#mysSeg button').forEach(b=>b.onclick=()=>{mys=b.dataset.m;renderMysList();});
  $$('#textSeg button').forEach(b=>b.onclick=()=>{textMode=b.dataset.t;renderMysList();});
  $('#rosIntent').oninput=()=>{rosIntent=$('#rosIntent').value;};
  $('#rosStart').onclick=()=>{saveHistoryContext();rosIntent=$('#rosIntent').value.trim();buildSteps();si=0;Proto.setState('terco-oracao',{prepared:true});};
  $('#prepResume').onclick=resumeRosary;
  $('#rosExit').onclick=()=>{const saved=LS.set('rosary',{mys,index:si,textMode,intention:rosIntent,time:Date.now()});goBack('rezar');if(saved)Proto.toast(t('resume.saved'));};
  $('#rosPrev').onclick=()=>{si=Math.max(0,si-1);renderRosary();};
  $('#rosNext').onclick=()=>{if(si===steps.length-1){LS.set('rosary',null);steps=[];Proto.setState('rezar');Proto.toast(t('resume.complete'));return;}si++;renderRosary();};
  $('#respNext').onclick=()=>{if(rsteps[ri]?.end){goBack(respOrigin);return;}ri++;renderRespiro();};
  $('#respExit').onclick=()=>goBack(respOrigin);
  $('#respChooseAgain').onclick=()=>{respMode=null;ri=0;renderRespiro();focusElement($('#respChoice h1'));};
  document.addEventListener('keydown',e=>{
    if($('#artInfoDialog').open)return;
    if(e.key==='Escape'){
      if($('#readingOptions').open && wasNarrow){$('#readingOptions').open=false;focusElement($('#readingOptions summary'));return;}
      if(Proto.state==='respiro')$('#respExit').click();else if(Proto.state==='terco-oracao')$('#rosExit').click();
      return;
    }
    if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('button,a,input,textarea,select,summary,[contenteditable="true"],[role="button"],.proto-bar,.proto-drawer'))return;
    if(Proto.state==='terco-oracao'){
      if(e.key===' '||e.key==='ArrowRight'){e.preventDefault();$('#rosNext').click();}
      if(e.key==='ArrowLeft'){e.preventDefault();$('#rosPrev').click();}
    }
    if(Proto.state==='respiro'&&respMode&&(e.key===' '||e.key==='ArrowRight')){e.preventDefault();$('#respNext').click();}
  });
  // Keep options inline on wide screens; use a keyboard-accessible disclosure on narrow ones.
  let wasNarrow=null;
  new ResizeObserver(()=>{
    const narrow=$('#app').clientWidth/parseFloat(getComputedStyle(document.documentElement).fontSize)<=56;
    if(narrow!==wasNarrow){$('#readingOptions').open=!narrow;wasNarrow=narrow;}
  }).observe($('#app'));
  window.addEventListener('pagehide',()=>{saveReading();saveHistoryContext();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveReading();saveHistoryContext();}});
  applySize();applyAppearance();renderMysList();
  Proto.init({
    id:'rezar-prioridades',title:'Rezar · oração ao alcance',refs:'Cenário: 28/10/2026',kind:'extension',photo:true,initial:'rezar',
    frames:[{id:'livre',label:'Janela livre'},{id:'1440',label:'Desktop 1440×900',w:1440,h:900},{id:'1024',label:'Notebook 1024×640',w:1024,h:640},{id:'800',label:'Estreita 800×600',w:800,h:600},{id:'390',label:'Celular 390×844',w:390,h:844,phone:true},{id:'360',label:'Celular 360×740',w:360,h:740,phone:true}],
    variants:[{file:'03-rezar.html',label:'Versão original'},{file:'03a-rezar-melhorada.html',label:'Versão revisada'},{file:'03b-rezar-arte.html',label:'Arte e recolhimento'},{file:'03c-rezar-prioridades.html',label:'3c · Oração ao alcance'}],
    options:[
      {id:'arteRezarV3',label:'Arte',values:[{v:'pintura',label:'Pintura contemplativa'},{v:'mosaico',label:'Mosaico sacro'},{v:'sem-imagens',label:'Sem imagens'}],apply(v){artStyle=v;renderEditorial();}},
      {id:'fraseRezarV3',label:'Frase do santo',values:[{v:'salva',label:'Frase cadastrada'},{v:'ausente',label:'Sem frase cadastrada'}],apply(v){quoteMode=v;renderEditorial();}},
      {id:'fundoRezarV3',label:'Fundo',values:[{v:'solido',label:'Escuro sereno'},{v:'foto',label:'Fotografia suavizada'}],apply(v){$('#app').classList.toggle('photo-surface',v==='foto');}},
    ],
    states:[
      {id:'rezar',group:'Entrada e acervo',label:'Rezar',hint:'Favoritos começam vazios. Leia um texto longo ou avance no terço para criar uma retomada real.'},
      {id:'biblioteca',group:'Entrada e acervo',label:'Biblioteca',hint:'Busca sem acentos e combinada com a categoria. Abra uma oração e volte para preservar o contexto.'},
      {id:'leitor-curto',group:'Leitor',label:'Texto curto',hint:'Centralização seletiva. Favorito pessoal, aparência Papel e limites A−/A+.'},
      {id:'leitor-longo',group:'Leitor',label:'Texto longo',hint:'Role, volte a Rezar e recarregue: a posição real permanece salva.'},
      {id:'leitor-evangelho',group:'Leitor',label:'Evangelho',hint:'Conteúdo de demonstração de 28/10, com versículos.'},
      {id:'evangelho-indisponivel',group:'Leitor',label:'Indisponível',hint:'Estado de demonstração com data explícita do último texto disponível.'},
      {id:'lectio',group:'Leitor',label:'Lectio Divina',hint:'No celular, use os atalhos Texto bíblico e Orientação. Notas guardadas por etapa.'},
      {id:'terco-preparacao',group:'Terço',label:'Preparação',hint:'Escolha mistérios e intenção opcional. A retomada só aparece com progresso salvo.'},
      {id:'terco-oracao',group:'Terço',label:'Oração',hint:'A posição salva corresponde à oração atual. Espaço respeita o botão focado.'},
      {id:'respiro',group:'Respiro',label:'Escolher prática',hint:'Oração breve, dezena ou oração livre. A saída volta ao contexto de origem.'},
    ],
    questions:[
      {q:'A entrada Rezar ajuda a escolher uma oração sem mostrar todo o acervo?'},
      {q:'A Biblioteca deixa claros os resultados e o escopo dos filtros?'},
      {q:'Orações essenciais e favoritos pessoais têm significados distintos?'},
      {q:'Ao abrir uma oração e voltar, a busca, a categoria e o foco permanecem?'},
      {q:'Leitura e terço retomam o ponto real, inclusive depois de recarregar?'},
      {q:'Opções de leitura e aparência Papel continuam acessíveis com texto ampliado?'},
      {q:'A Lectio permite alternar entre o texto bíblico e a orientação em telas estreitas?'},
      {q:'Anterior/Próxima e teclado funcionam de forma previsível no terço?'},
      {q:'O Respiro oferece liberdade de prática e retorna ao lugar esperado?'},
      {q:'Pintura ou mosaico convive melhor com o Evangelho, o retrato e as ações?'},
      {q:'A frase tem autoria clara e desaparece sem deixar espaço quando não está cadastrada?'},
    ],
    getContext:captureContext,
    onBeforeState(id,prev,opts){
      saveReading();
      if(!opts.first&&!opts.restore&&!opts.prepared)saveHistoryContext();
      readingReady=false;readerEpoch++;
      if(!opts.restore&&!opts.first&&id!==prev){
        if(READER_STATES.includes(id)||id==='lectio'||id==='terco-preparacao')returnRoute=prev;
        if(id==='respiro'){respOrigin=prev;respMode=null;ri=0;}
      }
    },
    onState(id,prev,opts){
      const c=opts.returnContext ?? (opts.restore?history.state?.context:opts.first&&history.state?.oraRezarV2?history.state.context:null);
      if(c){cat=c.cat||t('search.all');query=c.query||'';current=c.current;returnRoute=c.returnRoute||'rezar';lectio=c.lectio||0;mys=c.mys||'gloriosos';textMode=c.textMode||'full';rosIntent=c.rosIntent||'';si=c.si||0;respMode=c.respMode;ri=c.ri||0;respOrigin=c.respOrigin||'rezar';restoreRatio=c.ratio??null;}
      $('#readingOptions').open=!wasNarrow;
      if(id==='rezar')renderHome();
      if(id==='biblioteca'){$('#search').value=query;renderCats();renderList();}
      if(READER_STATES.includes(id)){
        if(opts.first && current?.kind==='prayer') { const saved=LS.get('pos-'+current.id);restoreRatio=validReading(saved)?saved.ratio:0; }
        renderReader(id);
      }
      if(id==='lectio'){current=null;if(!c)lectio=0;renderLectio(true);$('#readerCtx').textContent=t('lectio.ctx');$('#favBtn').hidden=true;}
      if(id==='terco-preparacao')renderPrep();
      if(id==='terco-oracao'){
        if(opts.first){const saved=LS.get('rosary');if(validRosary(saved)){mys=saved.mys;si=saved.index;textMode=saved.textMode;rosIntent=saved.intention||'';}else si=0;buildSteps();}
        else if(c)buildSteps();
        else if(!opts.prepared){const saved=LS.get('rosary');if(validRosary(saved)){mys=saved.mys;si=saved.index;textMode=saved.textMode;rosIntent=saved.intention||'';}else si=0;buildSteps();}
        renderRosary();
      }
      if(id==='respiro'){if(respMode)buildRespiro(respMode,false);renderRespiro();}
      requestAnimationFrame(()=>{
        if(id!==Proto.state||READER_STATES.includes(id))return;
        const view=id==='rezar'?$('#homeView'):id==='biblioteca'?$('#libraryView'):null;
        if(view)view.scrollTop=c?.scroll||0;
        const origin=c?.focus?document.querySelector(c.focus):null;
        focusElement(origin|| (id==='rezar'?$('#homeView h1'):id==='biblioteca'?$('#libraryView h1'):id==='lectio'?$('#lectioText h1'):id==='terco-oracao'?$('#rosNext'):id==='terco-preparacao'?$('.prep-terco h1'):id==='respiro'?(respMode?$('#respNext'):$('#respChoice h1')):null));
      });
    },
  });
})();
