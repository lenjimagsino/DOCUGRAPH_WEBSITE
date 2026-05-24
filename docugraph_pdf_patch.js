/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  DOCUGRAPH PDF PATCH — Type-Aware PDF Export                        ║
 * ║                                                                      ║
 * ║  HOW TO APPLY:                                                       ║
 * ║  1. Open try.html in a text editor                                  ║
 * ║  2. Find:  function exportAsProfessionalPDF(exportOptions = {}) {   ║
 * ║  3. Select from that line to its closing  }  (the matching brace)  ║
 * ║  4. Replace the entire function with the code below                 ║
 * ║                                                                      ║
 * ║  OR add this as a <script> tag just before </body> in try.html:    ║
 * ║  <script src="docugraph_pdf_patch.js"></script>                     ║
 * ║  (the self-executing wrapper at the bottom handles the override)    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Supported document types and their PDF rendering:
 *  • Flowchart   → Box+arrow diagram, diamonds for decisions
 *  • Receipt     → Key-value transaction table (Ref No, Amount, Sender…)
 *  • Invoice     → KV header + line-item tables
 *  • Résumé/CV   → Auto-split into Contact/Experience/Education/Skills…
 *  • Contract    → Parties section + numbered clause list
 *  • Report      → Abstract/Introduction/Methodology/Results/Conclusion…
 *  • Letter      → Greeting / Body / Closing blocks
 *  • Form        → Field:Value table, checkbox lines
 *  • Generic     → Headers → paragraphs → tables → figures
 *
 * All types include:
 *  ✓ Type-coloured header bar with document type label
 *  ✓ 6-metric summary strip (Confidence, Words, Tables, Shapes, Errors, Method)
 *  ✓ Type-specific body rendering
 *  ✓ Quality flags table
 *  ✓ Processing pipeline stages
 *  ✓ Full metadata table
 *  ✓ Per-page footers with document type
 */
  /**
   * TYPE-AWARE PDF EXPORT
   * Replaces exportAsProfessionalPDF() in try.html
   * Handles: Flowchart, Receipt, Invoice, Resume, Contract, Report, Letter, Form, Generic
   * Call signature kept identical: exportAsProfessionalPDF(exportOptions = {})
   */
  function exportAsProfessionalPDF(exportOptions = {}) {
    const opts = {
      includeTableGrids: exportOptions.includeTableGrids !== false,
      includeShapes:     exportOptions.includeShapes     !== false,
      includeImages:     exportOptions.includeImages      !== false,
      formatTemplate:    exportOptions.formatTemplate    || 'standard',
    };

    const doc = window.lastProcessedDocument;
    if (!doc) { alert('No document analyzed yet. Please run OCR first.'); return; }
    if (!window.jspdf?.jsPDF) { alert('PDF library still loading. Please wait a second and try again.'); setTimeout(()=>exportAsProfessionalPDF(exportOptions),1200); return; }

    try {
      const jsPDF   = window.jspdf.jsPDF;
      const pdf     = new jsPDF('p','mm','a4');
      const pageW   = pdf.internal.pageSize.getWidth();
      const pageH   = pdf.internal.pageSize.getHeight();
      const M       = 15;
      const CW      = pageW - M*2;
      let y         = M;

      // ── Palette ────────────────────────────────────────────────────────
      const C = {
        green:   [28,122,57],   greenLt: [240,253,244],
        amber:   [217,119,6],   amberLt: [255,251,235],
        blue:    [37,99,235],   blueLt:  [239,246,255],
        purple:  [124,58,237],  purpleLt:[245,243,255],
        pink:    [236,72,153],  pinkLt:  [253,242,248],
        red:     [185,28,28],   redLt:   [254,226,226],
        teal:    [13,148,136],  tealLt:  [240,253,250],
        slate:   [71,85,105],   slateLt: [248,250,252],
        gray:    [102,102,102], lgray:   [229,231,235],
        black:   [26,26,26],    white:   [255,255,255],
      };

      // ── Detect document type ──────────────────────────────────────────
      const rawText   = (doc.ocr?.text || doc.text || '').trim();
      const structure = doc.structure || {};
      const regions   = doc.ocr?.regionResults || [];
      const allRegions= doc.layout?.regions || regions;

      const docTypeMeta = (structure.documentType || '').toLowerCase();
      const detectedType = (() => {
        if (/flowchart|diagram/i.test(docTypeMeta))                            return 'flowchart';
        if (/receipt/i.test(docTypeMeta))                                      return 'receipt';
        if (/invoice/i.test(docTypeMeta))                                      return 'invoice';
        if (/resume|cv/i.test(docTypeMeta))                                    return 'resume';
        if (/contract|agreement/i.test(docTypeMeta))                           return 'contract';
        if (/report/i.test(docTypeMeta))                                       return 'report';
        if (/letter/i.test(docTypeMeta))                                       return 'letter';
        if (/form/i.test(docTypeMeta))                                         return 'form';
        // Keyword fallbacks on raw text
        if (/flowchart|diagram|process\s*flow|→|↓|▶/i.test(rawText))          return 'flowchart';
        if (/gcash|receipt|transaction\s*id|ref\s*no|amount\s*sent/i.test(rawText)) return 'receipt';
        if (/invoice|bill\s*to|ship\s*to|total\s*due|line\s*items/i.test(rawText)) return 'invoice';
        if (/sincerely|dear\s|yours\s*truly|regards/i.test(rawText))          return 'letter';
        if (/experience|education|skills|resume|curriculum\s*vitae/i.test(rawText)) return 'resume';
        if (/agreement|contract|party|whereas|liability|clause/i.test(rawText)) return 'contract';
        if (/abstract|introduction|methodology|conclusion|references/i.test(rawText)) return 'report';
        if (allRegions.filter(r=>r.type==='shape').length > 2) return 'flowchart';
        return 'generic';
      })();

      const TYPE_LABEL = {
        flowchart:'Flowchart / Diagram', receipt:'Receipt / Transaction',
        invoice:'Invoice / Bill',        resume:'Résumé / CV',
        contract:'Contract / Agreement', report:'Report / Research',
        letter:'Letter / Correspondence',form:'Form / Application',
        generic:'Document',
      };
      const TYPE_COLOR = {
        flowchart:C.pink,  receipt:C.teal,  invoice:C.amber,
        resume:C.blue,     contract:C.purple, report:C.green,
        letter:C.slate,    form:C.red,       generic:C.gray,
      };
      const ACCENT    = TYPE_COLOR[detectedType] || C.gray;
      const ACCENT_LT = ACCENT.map(v=>Math.min(255,v+190));

      const shapeRegions = allRegions.filter(r=>r.type==='shape');
      const tableRegions = allRegions.filter(r=>r.type==='table');
      const zeroRegions  = allRegions.length === 0;

      // ── Helpers ───────────────────────────────────────────────────────
      function checkPage(need=10){ if(y+need>pageH-10){pdf.addPage();y=M;} }
      function rule(col=C.lgray){ checkPage(4);pdf.setDrawColor(...col);pdf.setLineWidth(0.25);pdf.line(M,y,pageW-M,y);y+=3.5; }
      function sectionBadge(label,col=ACCENT){
        checkPage(13);
        pdf.setFillColor(...col);pdf.roundedRect(M,y,CW,8.5,1.5,1.5,'F');
        pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.setTextColor(255,255,255);
        pdf.text(label,M+4,y+6);y+=12;
      }
      function para(text,opts={}){
        if(!text)return;
        pdf.setFont('helvetica',opts.bold?'bold':'normal');
        pdf.setFontSize(opts.size||9);pdf.setTextColor(...(opts.color||C.black));
        pdf.splitTextToSize(String(text),CW-(opts.indent||0))
          .forEach(ln=>{checkPage(6);pdf.text(ln,M+(opts.indent||0),y);y+=opts.size?opts.size*0.52+0.8:5.5;});
      }
      function autoKV(pairs,accentCol=ACCENT){
        if(!pairs.length)return;
        pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'plain',
          styles:{fontSize:9,cellPadding:2.5},
          columnStyles:{0:{fontStyle:'bold',textColor:accentCol,cellWidth:48},1:{textColor:C.black}},
          body:pairs});
        y=pdf.lastAutoTable.finalY+4;
      }
      function emitRawText(boxed=true){
        if(!rawText)return;
        const lns=pdf.splitTextToSize(rawText,CW-6);
        pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(...C.black);
        lns.forEach(ln=>{
          checkPage(6);
          if(boxed){pdf.setFillColor(248,250,252);pdf.rect(M,y-3.5,CW,5.2,'F');}
          pdf.text(ln,M+(boxed?3:0),y);y+=5;
        });
        y+=3;
      }
      function emitTables(){
        const tr=window.lastTableResults;
        if(tr&&tr.cellsData&&tr.cellsData.length>0){
          sectionBadge('Detected Tables',C.amber);
          const maxRow=Math.max(...tr.cellsData.map(c=>c.row));
          const head=[tr.headers];
          const body=[];
          for(let r=0;r<=maxRow;r++)
            body.push(tr.cellsData.filter(c=>c.row===r).sort((a,b)=>a.col-b.col).map(c=>c.text||''));
          pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'striped',
            headStyles:{fillColor:C.amber,textColor:C.white,fontStyle:'bold',fontSize:8},
            bodyStyles:{fontSize:8},alternateRowStyles:{fillColor:C.amberLt},
            head,body});
          y=pdf.lastAutoTable.finalY+5;rule();
        } else if(tableRegions.length){
          sectionBadge('Detected Tables',C.amber);
          tableRegions.forEach((tbl,ti)=>{
            checkPage(12);
            para(`Table ${ti+1}  ·  confidence ${((tbl.conf||0)*100).toFixed(0)}%`,{bold:true,color:C.amber,size:8});
            if(tbl.rows&&tbl.cols){
              const hRow=Array.from({length:tbl.cols},(_,i)=>`Col ${i+1}`);
              const bRows=Array.from({length:tbl.rows},()=>Array.from({length:tbl.cols},()=>'—'));
              pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'grid',
                headStyles:{fillColor:C.amber,textColor:C.white,fontSize:7.5},
                bodyStyles:{fontSize:7.5,textColor:C.gray},head:[hRow],body:bRows});
              y=pdf.lastAutoTable.finalY+4;
            } else if(tbl.text){ para(tbl.text,{size:8}); }
          });
          rule();
        }
      }
      function extractKV(text, patterns){
        const pairs=[];
        (text||'').split('\n').forEach(line=>{
          patterns.forEach(([re,label])=>{
            const m=line.match(re);
            if(m) pairs.push([label,(m[2]||m[1]).trim()]);
          });
        });
        return pairs;
      }

      // ══════════════════════════════════════════════════════════════════
      // PAGE HEADER BAR
      // ══════════════════════════════════════════════════════════════════
      pdf.setFillColor(...ACCENT);pdf.rect(0,0,pageW,19,'F');

      // Type pill
      pdf.setFillColor(255,255,255);
      pdf.roundedRect(M,3.5,42,8,1.5,1.5,'F');
      pdf.setFont('helvetica','bold');pdf.setFontSize(7);
      pdf.setTextColor(...ACCENT);
      pdf.text(TYPE_LABEL[detectedType].toUpperCase(),M+2,9.2);

      pdf.setFont('helvetica','bold');pdf.setFontSize(13);
      pdf.setTextColor(255,255,255);pdf.text('DOCUGRAPH',M+46,11);
      pdf.setFont('helvetica','normal');pdf.setFontSize(8);
      pdf.text('Document Analysis Report',M+46,17);

      const fn=(doc.filename||'document').replace(/\.[^/.]+$/,'');
      pdf.setFontSize(7.5);pdf.setTextColor(220,255,230);
      pdf.text(fn,pageW-M,10,{align:'right'});
      pdf.text(new Date().toLocaleDateString(),pageW-M,16,{align:'right'});
      y=25;

      // ── 6-metric summary strip ────────────────────────────────────────
      pdf.setFillColor(...ACCENT_LT);pdf.rect(M,y,CW,14,'F');
      const conf=(doc.ocr?.confidence||0);
      const wordCount=(doc.ocr?.words||[]).length;
      const tblCount=(doc.tables||[]).length;
      const errCount=(doc.semantics?.errorFlags||[]).length;
      const shCount=shapeRegions.length;
      const items=[
        ['Confidence',  (conf*100).toFixed(1)+'%'],
        ['Words',       wordCount.toString()],
        ['Tables',      tblCount.toString()],
        ['Shapes',      shCount.toString()],
        ['Errors',      errCount.toString()],
        ['Method',      (doc.ocr?.extractionMethod||'OCR').replace('Direct Tesseract ','').slice(0,12)],
      ];
      const iCW=CW/items.length;
      items.forEach(([k,v],i)=>{
        const x=M+i*iCW+iCW/2;
        pdf.setFont('helvetica','bold');pdf.setFontSize(11.5);pdf.setTextColor(...ACCENT);
        pdf.text(v,x,y+8.5,{align:'center'});
        pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);pdf.setTextColor(...C.gray);
        pdf.text(k,x,y+13,{align:'center'});
      });
      y+=17;rule();

      // ══════════════════════════════════════════════════════════════════
      // TYPE-SPECIFIC BODY
      // ══════════════════════════════════════════════════════════════════

      // ── FLOWCHART ────────────────────────────────────────────────────
      if (detectedType==='flowchart') {
        sectionBadge('Flowchart / Diagram Reconstruction',C.pink);

        // Build node list from shape regions or parsed text
        let flowNodes=[];
        if(opts.includeShapes&&shapeRegions.length>0){
          flowNodes=[...shapeRegions]
            .sort((a,b)=>{
              const ab=Array.isArray(a.bbox)?a.bbox:[a.bbox.x0,a.bbox.y0,a.bbox.x1,a.bbox.y1];
              const bb=Array.isArray(b.bbox)?b.bbox:[b.bbox.x0,b.bbox.y0,b.bbox.x1,b.bbox.y1];
              const dy=(ab[1]+ab[3])/2-(bb[1]+bb[3])/2;
              return Math.abs(dy)>4?dy:(ab[0]+ab[2])/2-(bb[0]+bb[2])/2;
            })
            .map((r,i)=>({label:(r.text||`Step ${i+1}`).trim().replace(/\s+/g,' '),conf:r.conf||r.confidence||0.8}));
        } else {
          // Parse raw OCR text — short lines = node labels
          const lines=rawText.split('\n').map(l=>l.trim()).filter(l=>l.length>1&&!/^[-=─━•]+$/.test(l));
          flowNodes=lines.filter(l=>l.length<=80).slice(0,20)
            .map(l=>({label:l,conf:conf||0.85}));
          if(!flowNodes.length)
            flowNodes=lines.slice(0,12).map(l=>({label:l.slice(0,60),conf:0.8}));
        }

        pdf.setFontSize(7);pdf.setFont('helvetica','italic');pdf.setTextColor(...C.gray);
        pdf.text(`${flowNodes.length} element(s) from ${shapeRegions.length>0?'detected shape regions':'OCR text'}`,M,y);y+=5;

        if(!flowNodes.length){
          para('No flowchart elements could be detected.',{color:C.gray});
        } else {
          const BOX_W=60,BOX_H=14,ARR=9;
          const bx=M+(CW-BOX_W)/2;
          const COLS=flowNodes.length>6?Math.max(2,Math.floor(CW/(BOX_W+8))):1;

          if(COLS===1){
            flowNodes.forEach((nd,idx)=>{
              const isFirst=idx===0,isLast=idx===flowNodes.length-1;
              const isDecision=/\?|yes\b|no\b|\bif\b|decision|check/i.test(nd.label);
              checkPage(BOX_H+ARR+4);
              let fillRGB,strokeRGB,textRGB;
              if(isFirst){fillRGB=[220,252,231];strokeRGB=C.green;textRGB=C.green;}
              else if(isLast){fillRGB=C.redLt;strokeRGB=C.red;textRGB=C.red;}
              else if(isDecision){fillRGB=C.amberLt;strokeRGB=C.amber;textRGB=C.amber;}
              else{fillRGB=C.slateLt;strokeRGB=C.slate;textRGB=C.slate;}
              pdf.setFillColor(...fillRGB);pdf.setDrawColor(...strokeRGB);pdf.setLineWidth(0.7);
              if(isDecision){
                const cx=bx+BOX_W/2,cy=y+BOX_H/2,hw=BOX_W/2,hh=BOX_H/2;
                pdf.lines([[hw,hh],[-hw,hh],[-hw,-hh],[hw,-hh]],cx-hw,cy,'F');
                pdf.lines([[hw,hh],[-hw,hh],[-hw,-hh],[hw,-hh]],cx-hw,cy,'D');
              } else if(isFirst||isLast){
                pdf.roundedRect(bx,y,BOX_W,BOX_H,BOX_H/2,BOX_H/2,'FD');
              } else {
                pdf.roundedRect(bx,y,BOX_W,BOX_H,2,2,'FD');
              }
              const lns=pdf.splitTextToSize(nd.label,BOX_W-8).slice(0,2);
              const lh=3.8,ty=y+BOX_H/2-(lns.length*lh)/2+lh*0.75;
              pdf.setFont('helvetica',isFirst||isLast?'bold':'normal');
              pdf.setFontSize(7.5);pdf.setTextColor(...textRGB);
              lns.forEach((ln,li)=>pdf.text(ln,bx+BOX_W/2,ty+li*lh,{align:'center'}));
              // conf chip
              pdf.setFillColor(...strokeRGB);pdf.roundedRect(bx+BOX_W-17,y+1,16,4,1.5,1.5,'F');
              pdf.setFontSize(5.5);pdf.setTextColor(255,255,255);
              pdf.text(`${(nd.conf*100).toFixed(0)}%`,bx+BOX_W-9,y+3.8,{align:'center'});
              y+=BOX_H;
              if(idx<flowNodes.length-1){
                const ax=bx+BOX_W/2;
                pdf.setDrawColor(...C.gray);pdf.setLineWidth(0.5);
                pdf.line(ax,y,ax,y+ARR-3);
                pdf.setFillColor(...C.gray);
                pdf.triangle(ax-2,y+ARR-3,ax+2,y+ARR-3,ax,y+ARR,'F');
                y+=ARR;
              }
            });
          } else {
            const cW=CW/COLS,nW=cW-6,nH=12;
            let col=0,ry=y;
            flowNodes.forEach((nd,idx)=>{
              if(col===0)checkPage(nH+6);
              const nx=M+col*cW,ny=ry;
              const isDecision=/\?|yes\b|no\b|\bif\b|decision/i.test(nd.label);
              pdf.setFillColor(...(isDecision?C.amberLt:C.slateLt));
              pdf.setDrawColor(...(isDecision?C.amber:C.slate));
              pdf.setLineWidth(0.5);pdf.roundedRect(nx,ny,nW,nH,1.5,1.5,'FD');
              pdf.setFillColor(...(isDecision?C.amber:C.slate));pdf.circle(nx+5,ny+5,3,'F');
              pdf.setFontSize(5.5);pdf.setTextColor(255,255,255);pdf.text(`${idx+1}`,nx+5,ny+5+1.8,{align:'center'});
              const lns=pdf.splitTextToSize(nd.label,nW-12).slice(0,2);
              pdf.setFontSize(7);pdf.setTextColor(...(isDecision?C.amber:C.slate));
              lns.forEach((ln,li)=>pdf.text(ln,nx+10,ny+nH/2-((lns.length-1)*3.5)/2+li*3.5));
              pdf.setFontSize(5);pdf.setTextColor(...C.gray);
              pdf.text(`${(nd.conf*100).toFixed(0)}%`,nx+nW-2,ny+nH-2,{align:'right'});
              col++;
              if(col>=COLS){col=0;ry+=nH+6;y=ry;}
            });
            if(col>0)y=ry+nH+6;
          }
          // Legend
          y+=3;checkPage(10);
          pdf.setFontSize(7);pdf.setFont('helvetica','bold');pdf.setTextColor(...C.gray);
          pdf.text('Legend:',M,y);y+=4;
          [[[220,252,231],C.green,'Start / End'],[C.slateLt,C.slate,'Process Step'],[C.amberLt,C.amber,'Decision']].forEach(([f,s,lbl],i)=>{
            const lx=M+i*40;
            pdf.setFillColor(...f);pdf.setDrawColor(...s);pdf.setLineWidth(0.3);
            pdf.roundedRect(lx,y,5,4,0.8,0.8,'FD');
            pdf.setFontSize(6.5);pdf.setTextColor(...C.black);pdf.text(lbl,lx+6.5,y+3);
          });
          y+=8;
        }
        rule();
        // Supplementary raw OCR text
        if(rawText){sectionBadge('Supplementary OCR Text',C.gray);emitRawText();rule();}
      }

      // ── RECEIPT ─────────────────────────────────────────────────────
      else if(detectedType==='receipt'){
        sectionBadge('Transaction Details',C.teal);
        const pairs=extractKV(rawText,[
          [/ref\s*no[.:#]?\s*(.+)/i,           'Reference No'],
          [/transaction\s*(id|no)[.:#]?\s*(.+)/i,'Transaction ID'],
          [/amount\s*(sent|paid|due)[.:#]?\s*(.+)/i,'Amount'],
          [/sender[.:#]?\s*(.+)/i,              'Sender'],
          [/recipient[.:#]?\s*(.+)/i,           'Recipient'],
          [/date[.:#]?\s*(.+)/i,                'Date'],
          [/time[.:#]?\s*(.+)/i,                'Time'],
          [/payment\s*method[.:#]?\s*(.+)/i,    'Payment Method'],
          [/phone[.:#]?\s*(.+)/i,               'Phone'],
          [/status[.:#]?\s*(.+)/i,              'Status'],
        ]);
        autoKV(pairs,C.teal);
        const misc=rawText.split('\n').filter(l=>l.trim()&&!pairs.find(p=>l.includes(p[1])));
        if(misc.length){sectionBadge('Additional Information',C.teal);misc.slice(0,20).forEach(l=>para(l,{size:8.5}));}
        rule();emitTables();
      }

      // ── INVOICE ─────────────────────────────────────────────────────
      else if(detectedType==='invoice'){
        sectionBadge('Invoice Details',C.amber);
        const pairs=extractKV(rawText,[
          [/invoice\s*(no|#|number)[.:#]?\s*(.+)/i,'Invoice No'],
          [/date[.:#]?\s*(.+)/i,'Date'],
          [/due\s*date[.:#]?\s*(.+)/i,'Due Date'],
          [/bill\s*to[.:#]?\s*(.+)/i,'Bill To'],
          [/ship\s*to[.:#]?\s*(.+)/i,'Ship To'],
          [/total[.:#]?\s*(.+)/i,'Total'],
          [/subtotal[.:#]?\s*(.+)/i,'Subtotal'],
          [/tax[.:#]?\s*(.+)/i,'Tax'],
          [/payment\s*terms[.:#]?\s*(.+)/i,'Payment Terms'],
        ]);
        autoKV(pairs,C.amber);
        rule();emitTables();
        emitRawText(false);
      }

      // ── RÉSUMÉ ──────────────────────────────────────────────────────
      else if(detectedType==='resume'){
        const sections=[
          {re:/^(contact|phone|email|address|linkedin)/i,   label:'Contact Information'},
          {re:/^(summary|objective|profile|about)/i,        label:'Professional Summary'},
          {re:/^(experience|employment|work|position)/i,    label:'Work Experience'},
          {re:/^(education|degree|university|college)/i,    label:'Education'},
          {re:/^(skills?|competenc|expertise)/i,            label:'Skills'},
          {re:/^(projects?|achievements?|awards?)/i,        label:'Projects & Achievements'},
          {re:/^(certif|license|qualif)/i,                  label:'Certifications'},
        ];
        const lines=rawText.split('\n').map(l=>l.trim()).filter(Boolean);
        const buckets={};let cur='General';buckets[cur]=[];
        lines.forEach(line=>{
          const match=sections.find(s=>s.re.test(line));
          if(match){cur=match.label;if(!buckets[cur])buckets[cur]=[];}
          else{if(!buckets[cur])buckets[cur]=[];buckets[cur].push(line);}
        });
        Object.entries(buckets).forEach(([sec,lns])=>{
          if(!lns.length)return;
          sectionBadge(sec,C.blue);
          lns.slice(0,30).forEach(l=>para(l,{size:8.5}));
          y+=2;
        });
        rule();emitTables();
      }

      // ── CONTRACT ────────────────────────────────────────────────────
      else if(detectedType==='contract'){
        sectionBadge('Contract Details',C.purple);
        const parties=[],terms=[];
        rawText.split('\n').forEach(line=>{
          if(/party|parties|between|agreement between/i.test(line)) parties.push(line.trim());
          if(/section|article|clause|\d+\.\s/i.test(line)) terms.push(line.trim());
        });
        if(parties.length){
          sectionBadge('Parties & Context',C.purple);
          parties.slice(0,8).forEach(p=>para(p,{size:8.5}));
          y+=3;rule();
        }
        if(terms.length){
          sectionBadge('Clauses & Sections',C.purple);
          terms.slice(0,25).forEach((t,i)=>{
            checkPage(7);
            pdf.setFillColor(...C.purpleLt);pdf.rect(M,y-3,CW,5.5,'F');
            pdf.setFont('helvetica','bold');pdf.setFontSize(8);pdf.setTextColor(...C.purple);
            pdf.text(`${i+1}`,M+2,y+1);
            pdf.setFont('helvetica','normal');pdf.setTextColor(...C.black);
            const lns=pdf.splitTextToSize(t,CW-8);
            pdf.text(lns[0],M+8,y+1);
            y+=6;
          });
          y+=2;rule();
        }
        if(!parties.length&&!terms.length)emitRawText(false);
        emitTables();
      }

      // ── REPORT ──────────────────────────────────────────────────────
      else if(detectedType==='report'){
        const sections=[
          {re:/^(abstract|summary|overview)/i,              label:'Abstract'},
          {re:/^(introduction|background|purpose)/i,        label:'Introduction'},
          {re:/^(methodology|method|approach)/i,            label:'Methodology'},
          {re:/^(results?|findings?|data)/i,                label:'Results'},
          {re:/^(discussion|analysis|interpretation)/i,     label:'Discussion'},
          {re:/^(conclusion|recommendation|next)/i,         label:'Conclusion'},
          {re:/^(references?|bibliography|citations?)/i,    label:'References'},
        ];
        const lines=rawText.split('\n').map(l=>l.trim()).filter(Boolean);
        const buckets={};let cur='Content';buckets[cur]=[];
        lines.forEach(line=>{
          const m=sections.find(s=>s.re.test(line));
          if(m){cur=m.label;if(!buckets[cur])buckets[cur]=[];}
          else{if(!buckets[cur])buckets[cur]=[];buckets[cur].push(line);}
        });
        Object.entries(buckets).forEach(([sec,lns])=>{
          if(!lns.length)return;
          sectionBadge(sec,C.green);
          lns.slice(0,40).forEach(l=>para(l,{size:8.5}));
          y+=2;
        });
        rule();emitTables();
      }

      // ── LETTER ──────────────────────────────────────────────────────
      else if(detectedType==='letter'){
        const lines=rawText.split('\n').map(l=>l.trim()).filter(Boolean);
        let greeting='',closing='',bodyLines=[];
        lines.forEach((l,i)=>{
          if(i===0||(i<3&&/dear |to whom/i.test(l))){greeting=l;}
          else if(/sincerely|regards|yours truly/i.test(l)){closing=lines.slice(i).join('\n');}
          else{bodyLines.push(l);}
        });
        if(greeting){sectionBadge('Greeting',C.slate);para(greeting,{size:10,bold:true});y+=3;rule();}
        if(bodyLines.length){sectionBadge('Body',C.slate);bodyLines.slice(0,60).forEach(l=>para(l,{size:9}));y+=3;rule();}
        if(closing){sectionBadge('Closing',C.slate);para(closing,{size:9});rule();}
        if(!greeting&&!bodyLines.length)emitRawText(false);
      }

      // ── FORM ────────────────────────────────────────────────────────
      else if(detectedType==='form'){
        sectionBadge('Form Fields',C.red);
        const formLines=rawText.split('\n').map(l=>l.trim()).filter(Boolean);
        const fields=[];
        formLines.forEach(line=>{
          const colonIdx=line.indexOf(':');
          if(colonIdx>0&&colonIdx<40){
            fields.push([line.slice(0,colonIdx).trim(), line.slice(colonIdx+1).trim()||'___________']);
          } else if(/\[\s*\]|☐|☑|\(\s*\)|_{3,}/.test(line)){
            fields.push(['Option', line]);
          } else {
            fields.push(['-', line]);
          }
        });
        if(fields.length){
          pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'grid',
            headStyles:{fillColor:C.red,textColor:C.white,fontStyle:'bold',fontSize:8},
            bodyStyles:{fontSize:8.5},alternateRowStyles:{fillColor:C.redLt},
            head:[['Field','Value']],
            body:fields.slice(0,40)});
          y=pdf.lastAutoTable.finalY+5;
        } else {
          emitRawText();
        }
        rule();emitTables();
      }

      // ── GENERIC ─────────────────────────────────────────────────────
      else {
        sectionBadge('Document Content');
        if(zeroRegions&&rawText){
          para('ℹ️ 0 layout regions detected — rendering full-page OCR extraction:',{size:8,color:C.purple,bold:true});
          y+=3;
        }
        emitRawText(false);
        rule();emitTables();
      }

      // ══════════════════════════════════════════════════════════════════
      // SHARED FOOTER SECTIONS (all types)
      // ══════════════════════════════════════════════════════════════════

      // Quality flags
      const errFlags=doc.semantics?.errorFlags||[];
      if(errFlags.length){
        sectionBadge(`Text Quality — ${errFlags.length} Low-Confidence Word(s)`,C.amber);
        pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'plain',
          styles:{fontSize:8,cellPadding:2},
          columnStyles:{0:{cellWidth:55},1:{textColor:C.amber}},
          head:[['Word','Confidence']],
          headStyles:{fillColor:C.amber,textColor:C.white,fontSize:8},
          body:errFlags.slice(0,15).map(w=>[`"${w.text||w}"`,`${((w.confidence||0.5)*100).toFixed(0)}%`])});
        y=pdf.lastAutoTable.finalY+5;rule();
      }

      // Processing pipeline
      if((doc.workflow||[]).length){
        sectionBadge('Processing Pipeline',C.gray);
        const stageW=CW/Math.min(doc.workflow.length,6);
        doc.workflow.slice(0,6).forEach((stage,i)=>{
          const sx=M+i*stageW;
          pdf.setFillColor(...ACCENT_LT);pdf.setDrawColor(...ACCENT);pdf.setLineWidth(0.3);
          pdf.roundedRect(sx,y,stageW-2,10,1.5,1.5,'FD');
          pdf.setFontSize(5.5);pdf.setFont('helvetica','bold');pdf.setTextColor(...ACCENT);
          pdf.text(`${i+1}`,sx+3,y+4);
          pdf.setFont('helvetica','normal');pdf.setTextColor(...C.black);
          pdf.text(pdf.splitTextToSize(stage,stageW-8)[0],sx+8,y+4);
          if(i<doc.workflow.length-1&&i<5){
            pdf.setDrawColor(...ACCENT);pdf.arrow(sx+stageW-1,y+5,sx+stageW+1,y+5,1);
          }
        });
        y+=14;rule();
      }

      // Metadata table
      sectionBadge('Analysis Metadata',C.gray);
      const lang=doc.ocr?.language||'eng';
      const method=doc.ocr?.extractionMethod||'Standard OCR';
      const ts=doc.timestamp?new Date(doc.timestamp).toLocaleString():'—';
      pdf.autoTable({startY:y,margin:{left:M,right:M},theme:'plain',
        styles:{fontSize:8,cellPadding:2.2},
        columnStyles:{0:{fontStyle:'bold',textColor:C.gray,cellWidth:45},1:{textColor:C.black}},
        body:[
          ['Detected Type',    TYPE_LABEL[detectedType]],
          ['Timestamp',        ts],
          ['Method',           method],
          ['Language',         lang],
          ['Confidence',       `${(conf*100).toFixed(1)}%`],
          ['Regions Analyzed', zeroRegions?'0 (full-page OCR)':allRegions.length.toString()],
          ['Tables Detected',  tblCount.toString()],
          ['Quality Flags',    errFlags.length.toString()],
          ['Word Count',       wordCount.toString()],
          ['Format Template',  opts.formatTemplate],
        ]});
      y=pdf.lastAutoTable.finalY+5;

      // ── Page footers ─────────────────────────────────────────────────
      const totalPg=pdf.internal.getNumberOfPages();
      for(let i=1;i<=totalPg;i++){
        pdf.setPage(i);
        pdf.setFontSize(7);pdf.setTextColor(...C.gray);
        pdf.text(`DOCUGRAPH  ·  ${TYPE_LABEL[detectedType]}  ·  Page ${i} of ${totalPg}`,
          pageW/2,pageH-5,{align:'center'});
        pdf.text(new Date().toLocaleDateString(),pageW-M,pageH-5,{align:'right'});
      }

      // ── Save ─────────────────────────────────────────────────────────
      pdf.save(`docugraph-${detectedType}-${Date.now()}.pdf`);
      console.log('✅ PDF saved —', TYPE_LABEL[detectedType]);

    } catch(err){
      console.error('PDF export error:', err);
      alert('Error generating PDF:\n\n'+err.message+'\n\nSee browser console for details.');
    }
  }

// ── Self-executing override (only runs when loaded as a <script> tag) ──
// This replaces the old function on window so no source edits are needed.
if (typeof window !== 'undefined') {
  window.exportAsProfessionalPDF = exportAsProfessionalPDF;
  console.log('✅ DOCUGRAPH PDF patch applied — type-aware PDF export active');
}
