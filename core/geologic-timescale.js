/* Curated nominal ages and PDF fill colours from the ICS chart, June 2026.
 * The original chart is evidence only, not redistributed with this software.
 * Row ranks adapt where a formal period/epoch subdivision is not defined. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderGeologicTime=api;})(globalThis,function(){
  "use strict";
  const SOURCE=Object.freeze({authority:"International Commission on Stratigraphy",version:"2026/06",
    url:"https://stratigraphy.org/ICSchart/ChronostratChart2026-06.pdf",minimumMa:0,maximumMa:4567,
    ages:"Nominal chart boundary ages; approximate boundaries remain approximate, not tree-age estimates.",
    colours:"Official PDF fills converted to sRGB by MuPDF; background is tinted with 90% white.",
    rows:"Period/epoch in the Phanerozoic; era/period in the Proterozoic; eon/era in the Archean; undivided Hadean eon.",
    outside_range:"Neutral grey marked Outside ICS range; never extrapolate geological units."});
  function tint(hex) {
    return "#"+hex.slice(1).match(/../g).map(c=>Math.round(parseInt(c,16)*.1+255*.9).toString(16).padStart(2,"0")).join("").toUpperCase();
  }
  function interval(name,shortName,older,younger,fill,rank="period",extra={}) {
    return Object.freeze({name,shortName,older,younger,fill,background:tint(fill),rank,...extra});
  }
  const periods=Object.freeze([
    interval("Hadean","Hadean",4567,4031,"#B41D8E","eon"),
    interval("Archean","Arch.",4031,2500,"#EC008C","eon"),
    interval("Paleoproterozoic","Paleoprot.",2500,1600,"#F16681","era"),
    interval("Mesoproterozoic","Mesoprot.",1600,1000,"#FCBC7E","era"),
    interval("Neoproterozoic","Neoprot.",1000,538.8,"#FCBA63","era"),
    interval("Cambrian","Cam.",538.8,486.85,"#8BAB79"),
    interval("Ordovician","Ord.",486.85,443.1,"#00A88E"),
    interval("Silurian","Sil.",443.1,419.62,"#B2DDC9"),
    interval("Devonian","Dev.",419.62,358.86,"#CF9C5A"),
    interval("Carboniferous","Carb.",358.86,298.9,"#67AEB2"),
    interval("Permian","Perm.",298.9,251.902,"#E7654A"),
    interval("Triassic","Trias.",251.902,201.4,"#8F53A1"),
    interval("Jurassic","Jur.",201.4,143.1,"#00B9E7"),
    interval("Cretaceous","K",143.1,66,"#88C86F"),
    interval("Paleogene","Pg",66,23.04,"#F9A870"),
    interval("Neogene","Ng",23.04,2.58,"#FFDE2E"),
    interval("Quaternary","Quat.",2.58,0,"#FFF799","period",{tinyName:"Q"}),
  ]);
  const epoch=(name,shortName,older,younger,fill,extra={})=>interval(name,shortName,older,younger,fill,"epoch",extra);
  const epochs=Object.freeze([
    interval("Hadean","Hadean",4567,4031,"#B41D8E","eon",{undivided:true}),
    interval("Eoarchean","Eoarch.",4031,3600,"#D80B8C","era"),
    interval("Paleoarchean","Paleoarch.",3600,3200,"#F067A6","era"),
    interval("Mesoarchean","Mesoarch.",3200,2800,"#F386AE","era"),
    interval("Neoarchean","Neoarch.",2800,2500,"#F7ADC4","era"),
    interval("Siderian","Sider.",2500,2300,"#F2718C"),
    interval("Rhyacian","Rhyac.",2300,2050,"#F27C96"),
    interval("Orosirian","Oros.",2050,1800,"#F386A1"),
    interval("Statherian","Stath.",1800,1600,"#F48FAC"),
    interval("Calymmian","Calym.",1600,1400,"#FDC692"),
    interval("Ectasian","Ectas.",1400,1200,"#FED09E"),
    interval("Stenian","Sten.",1200,1000,"#FFDAAB"),
    interval("Tonian","Ton.",1000,720,"#FEC46F","period",{youngerApproximate:true}),
    interval("Cryogenian","Cryog.",720,635,"#FFCE7B","period",{olderApproximate:true,youngerApproximate:true}),
    interval("Ediacaran","Ediac.",635,538.8,"#FFD887","period",{olderApproximate:true}),
    epoch("Terreneuvian","Terren.",538.8,521,"#95B68B",{youngerApproximate:true}),
    epoch("Cambrian Series 2","Series 2",521,506.5,"#9FC195",{informal:true,olderApproximate:true,youngerApproximate:true}),
    epoch("Miaolingian","Miaol.",506.5,497,"#AACDA1",{olderApproximate:true,youngerApproximate:true}),
    epoch("Furongian","Furong.",497,486.85,"#B6DCAE",{olderApproximate:true}),
    epoch("Early Ordovician","Early Ord.",486.85,471.3,"#00AE8D"),
    epoch("Middle Ordovician","Middle Ord.",471.3,458.2,"#34BB9D"),
    epoch("Late Ordovician","Late Ord.",458.2,443.1,"#7FCBAE"),
    epoch("Llandovery","Lland.",443.1,432.9,"#97D5C9"),
    epoch("Wenlock","Wenl.",432.9,426.7,"#B1DED2"),
    epoch("Ludlow","Ludl.",426.7,422.7,"#BDE3DC"),
    epoch("Pridoli","Prid.",422.7,419.62,"#E3F2E7"),
    epoch("Early Devonian","Early Dev.",419.62,393.47,"#E4B46E"),
    epoch("Middle Devonian","Middle Dev.",393.47,382.31,"#F1CA84"),
    epoch("Late Devonian","Late Dev.",382.31,358.86,"#F2DFAF"),
    epoch("Early Mississippian","Early Miss.",358.86,346.7,"#89B28B"),
    epoch("Middle Mississippian","Middle Miss.",346.7,330.3,"#A1B98A"),
    epoch("Late Mississippian","Late Miss.",330.3,323.4,"#B9C089"),
    epoch("Early Pennsylvanian","Early Penn.",323.4,315.2,"#8CC0C7"),
    epoch("Middle Pennsylvanian","Middle Penn.",315.2,307,"#A6C8C8"),
    epoch("Late Pennsylvanian","Late Penn.",307,298.9,"#BFD0C9"),
    epoch("Cisuralian","Cisur.",298.9,274.4,"#E87864"),
    epoch("Guadalupian","Guadal.",274.4,259.857,"#F58D76"),
    epoch("Lopingian","Loping.",259.857,251.902,"#F9B4A3"),
    epoch("Early Triassic","Early Tr",251.902,247,"#A05DA5"),
    epoch("Middle Triassic","Middle Tr",247,237,"#B282B9",{youngerApproximate:true}),
    epoch("Late Triassic","Late Tr",237,201.4,"#BC9DCA",{olderApproximate:true}),
    epoch("Early Jurassic","Early J",201.4,174.7,"#00B5EC"),
    epoch("Middle Jurassic","Middle J",174.7,161.5,"#71CFEB"),
    epoch("Late Jurassic","Late J",161.5,143.1,"#ABE1FA"),
    epoch("Early Cretaceous","Early K",143.1,100.5,"#94CC78"),
    epoch("Late Cretaceous","Late K",100.5,66,"#AFD46C"),
    epoch("Paleocene","Pal.",66,56,"#FAB27B"),
    epoch("Eocene","Eoc.",56,33.9,"#FCBC86"),
    epoch("Oligocene","Olig.",33.9,23.04,"#FDC692",{tinyName:"Olig"}),
    epoch("Miocene","Mio.",23.04,5.333,"#FFF200"),
    epoch("Pliocene","Plio.",5.333,2.58,"#FFF9AE",{tinyName:"Pl"}),
    epoch("Pleistocene","Pst.",2.58,.0117,"#FFEDA9",{tinyName:"Ps"}),
    epoch("Holocene","Hol.",.0117,0,"#FFE6CB",{tinyName:"H"}),
  ]);
  function intervalsForRange(maximum) {
    if (!Number.isFinite(maximum)||maximum<=0) throw new TypeError("Invalid geological range");
    if (maximum<=SOURCE.maximumMa) return {periods,epochs};
    const outside=interval("Outside ICS range","Unmapped",maximum,SOURCE.maximumMa,"#E5E5E5","unmapped");
    return {periods:Object.freeze([outside,...periods]),epochs:Object.freeze([outside,...epochs])};
  }
  return Object.freeze({SOURCE,periods,epochs,intervalsForRange});
});
