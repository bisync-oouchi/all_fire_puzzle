import {storage} from "./storage.js";

const midi=note=>440*Math.pow(2,(note-69)/12);

export class AudioEngine{
  constructor(){
    this.ctx=null;this.master=null;this.sfxBus=null;this.musicBus=null;this.bgmMode="off";this.titleAudio=null;this.bgmTimer=0;this.bgmStep=0;this.bgmNextTime=0;this.bgmNodes=new Set();this.burnGain=null;this.burnCount=0;this.burnTimer=0;this.noiseBuffer=null;this.noiseOffset=0;this.forestSeed=1977;this.masterLevel=1.28;this.muted=storage.getItem("hinomawari-muted")==="1";
    this.ensureTitleAudio();
  }
  ensureTitleAudio(){
    if(!this.titleAudio&&typeof Audio!=="undefined"){this.titleAudio=new Audio("assets/fire_title_bgm.wav");this.titleAudio.loop=true;this.titleAudio.preload="auto";this.titleAudio.volume=.78}
    return this.titleAudio;
  }
  playTitle(){
    const player=this.ensureTitleAudio();if(!player||this.muted||this.bgmMode!=="title")return Promise.resolve(false);
    return player.play().then(()=>true).catch(()=>false);
  }
  async unlock(){
    if(!this.ctx){
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=14;compressor.ratio.value=5;compressor.attack.value=.005;compressor.release.value=.22;
      this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:this.masterLevel;this.sfxBus=this.ctx.createGain();this.musicBus=this.ctx.createGain();this.sfxBus.gain.value=1.42;this.musicBus.gain.value=1.2;
      this.sfxBus.connect(this.master);this.musicBus.connect(this.master);this.master.connect(compressor).connect(this.ctx.destination);
      this.makeNoiseBuffer();this.makeBurnLoop();
      if(this.bgmMode!=="off"&&this.bgmMode!=="title"&&!this.muted){this.bgmNextTime=this.ctx.currentTime+.03;this.scheduleBgm()}
    }
    if(this.ctx.state==="suspended")await this.ctx.resume();
  }
  toggle(){
    this.muted=!this.muted;storage.setItem("hinomawari-muted",this.muted?"1":"0");if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.masterLevel,this.ctx.currentTime,.02);
    if(this.muted){this.stopBgmSchedule();this.titleAudio?.pause()}else if(this.bgmMode!=="off"){if(this.bgmMode==="title")this.playTitle();else{this.bgmNextTime=this.ctx.currentTime+.03;this.scheduleBgm()}}
    return this.muted;
  }
  bus(channel){return channel==="sfx"?this.sfxBus:this.musicBus}
  tone(freq,start,duration=.12,type="triangle",volume=.12,endFreq=freq,channel="sfx"){
    if(!this.ctx||this.muted)return;
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,start);osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),start+duration);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain).connect(this.bus(channel));
    if(channel==="bgm"){this.bgmNodes.add(osc);osc.addEventListener("ended",()=>this.bgmNodes.delete(osc),{once:true})}
    osc.start(start);osc.stop(start+duration+.03);return osc;
  }
  makeNoiseBuffer(){
    const length=this.ctx.sampleRate*2,buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate),data=buffer.getChannelData(0);let seed=918273,last=0;
    for(let i=0;i<length;i++){seed=seed*16807%2147483647;last=last*.18+(seed/1073741824-1)*.82;data[i]=last}this.noiseBuffer=buffer;
  }
  noise(duration=.1,volume=.1,frequency=1200,filterType="lowpass",channel="sfx"){
    if(!this.ctx||this.muted||!this.noiseBuffer)return;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter(),now=this.ctx.currentTime;source.buffer=this.noiseBuffer;filter.type=filterType;filter.frequency.value=frequency;filter.Q.value=filterType==="bandpass"?.8:.4;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.connect(filter).connect(gain).connect(this.bus(channel));this.noiseOffset=(this.noiseOffset+.317)%1.5;source.start(now,this.noiseOffset,duration+.02);source.stop(now+duration+.03);
  }
  ignite(count=1){
    const t=this.ctx?.currentTime||0,strength=Math.min(1.8,1+Math.log2(Math.max(1,count))*.18);this.noise(.16,.25*strength,2100,"bandpass");this.tone(125,t,.16,"sawtooth",Math.min(.23,.14*strength),520);
  }
  extinguish(count=1){
    const t=this.ctx?.currentTime||0,strength=Math.min(1.7,1+Math.log2(Math.max(1,count))*.16);this.noise(.34,.24*strength,850,"bandpass");this.tone(210,t,.24,"sine",Math.min(.16,.1*strength),65);
  }
  melt(count=1){
    const t=this.ctx?.currentTime||0,strength=Math.min(1.6,1+Math.log2(Math.max(1,count))*.14);this.noise(.42,.13*strength,1750,"bandpass");this.tone(980,t,.32,"sine",Math.min(.14,.085*strength),430);this.tone(610,t+.08,.28,"sine",Math.min(.1,.06*strength),250);
  }
  explosion(count=1){
    const t=this.ctx?.currentTime||0,strength=Math.min(2,1+Math.log2(Math.max(1,count))*.22);this.noise(.5,.34*strength,520,"lowpass");this.tone(74,t,.42,"sawtooth",Math.min(.3,.18*strength),31);this.tone(148,t+.03,.2,"square",Math.min(.16,.09*strength),55);
  }
  burnout(type,count=1){
    if(!this.ctx)return;const t=this.ctx.currentTime,strength=Math.min(2,1+Math.log2(Math.max(1,count))*.2),v=Math.min(.2,.1*strength);
    if(type===0){this.noise(.18,.12*strength,2300,"bandpass");this.tone(620,t,.13,"triangle",v,420)}
    if(type===1){this.noise(.12,.13*strength,720,"lowpass");this.tone(185,t,.16,"triangle",v,135)}
    if(type===2){this.noise(.2,.15*strength,520,"lowpass");this.tone(130,t,.22,"triangle",v,82)}
    if(type===3){this.tone(740,t,.28,"sine",v,510);this.tone(1480,t,.18,"sine",v*.35,1080)}
    if(type===4){this.noise(.3,.3*strength,640,"lowpass");this.tone(72,t,.3,"sawtooth",Math.min(.25,.15*strength),36)}
    if(type===5){this.tone(920,t,.2,"sine",v,510);this.tone(610,t+.08,.18,"sine",v*.6,360)}
    if(type===6){this.noise(.36,.22*strength,1100,"bandpass");this.tone(230,t,.2,"sine",v*.7,90)}
    if(type===7){this.noise(.16,.16*strength,480,"lowpass");this.tone(105,t,.25,"sawtooth",v,58)}
    if(type===8){this.noise(.38,.34*strength,780,"lowpass");this.tone(64,t,.36,"sawtooth",Math.min(.28,.17*strength),32)}
    if(type===9){this.noise(.16,.14*strength,520,"lowpass");this.tone(150,t,.2,"triangle",v,92)}
    if(type===10){this.noise(.32,.2*strength,360,"lowpass");this.tone(82,t,.34,"triangle",v,48)}
    if(type===18){this.noise(.4,.24*strength,980,"bandpass");this.tone(260,t,.28,"sine",v,85)}
    if(type===19){this.noise(.3,.2*strength,310,"lowpass");this.tone(92,t,.38,"triangle",v,46)}
    if(type===20){this.noise(.28,.26*strength,470,"lowpass");this.tone(78,t,.34,"sawtooth",Math.min(.24,.14*strength),34)}
    if(type>=13){this.tone(type===13?680:210,t,.26,"triangle",v,type===13?390:105);this.noise(.12,.08*strength,700,"bandpass")}
  }
  gameStart(){if(!this.ctx)return;const t=this.ctx.currentTime;[55,60,64].forEach((n,i)=>this.tone(midi(n),t+i*.11,.2,"triangle",.14,midi(n)*.96))}
  clear(){if(!this.ctx)return;const t=this.ctx.currentTime;[60,64,67,72].forEach((n,i)=>this.tone(midi(n),t+i*.13,.3,"triangle",.14,midi(n)*1.03));this.birdCall(t+.25,true,.8)}
  fail(){if(!this.ctx)return;const t=this.ctx.currentTime;[52,48,45].forEach((n,i)=>this.tone(midi(n),t+i*.18,.3,"triangle",.14,midi(n)*.84))}
  makeBurnLoop(){
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();source.buffer=this.noiseBuffer;source.loop=true;filter.type="lowpass";filter.frequency.value=390;filter.Q.value=.25;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.sfxBus);source.start();this.burnGain=gain;
  }
  setBurning(count){
    const wasBurning=this.burnCount>0;this.burnCount=count;
    if(this.burnGain)this.burnGain.gain.setTargetAtTime(count?Math.min(.085,.014+Math.log1p(count)*.012):0,this.ctx.currentTime,count?.12:.18);
    if(count&&!wasBurning)this.burnTick();
    if(!count&&this.burnTimer){clearTimeout(this.burnTimer);this.burnTimer=0}
  }
  burnTick(){
    if(!this.ctx||!this.burnCount){this.burnTimer=0;return}
    const strength=Math.min(2.2,1+Math.log2(Math.max(1,this.burnCount))*.16),r=this.random(),now=this.ctx.currentTime;
    if(this.burnGain){const base=Math.min(.085,.012+Math.log1p(this.burnCount)*.011),swell=base*(.55+r*.8);this.burnGain.gain.cancelScheduledValues(now);this.burnGain.gain.setTargetAtTime(swell,now,.055+r*.07)}
    if(r>.22){
      const sharp=this.random()>.45,duration=.018+this.random()*.042,volume=(.075+this.random()*.075)*strength;
      this.noise(duration,volume,sharp?1450+this.random()*1500:620+this.random()*720,"bandpass");
      if(this.random()>.62)this.tone(105+this.random()*115,now,duration+.025,"triangle",.035*strength,70+this.random()*55);
    }
    if(this.random()>.82)this.noise(.15+this.random()*.16,.025*strength,260+this.random()*190,"lowpass");
    const delay=Math.max(80,245-this.burnCount*3)+this.random()*260;this.burnTimer=setTimeout(()=>this.burnTick(),delay);
  }
  random(){this.forestSeed=this.forestSeed*48271%2147483647;return this.forestSeed/2147483647}
  birdCall(start=this.ctx?.currentTime||0,bright=true,strength=1,channel="music"){
    const base=bright?midi(83+Math.floor(this.random()*5)):midi(76+Math.floor(this.random()*5));this.tone(base,start,.13,"sine",.065*strength,base*1.28,channel);this.tone(base*1.08,start+.11,.1,"sine",.05*strength,base*.94,channel);
  }
  smallAnimal(start=this.ctx?.currentTime||0,channel="music"){const base=midi(72+Math.floor(this.random()*4));this.tone(base,start,.09,"triangle",.045,base*.82,channel);this.tone(base*.94,start+.12,.08,"triangle",.038,base*.76,channel)}
  forestRustle(start=this.ctx?.currentTime||0,channel="music"){
    if(!this.ctx)return;const base=760+this.random()*520;
    this.tone(base,start,.045,"triangle",.014,base*(.48+this.random()*.12),channel);
    if(this.random()>.48)this.tone(base*.72,start+.055,.035,"triangle",.009,base*.38,channel);
  }
  woodCrackle(start=this.ctx?.currentTime||0,strength=1){
    if(!this.ctx)return;
    const pitch=105+this.random()*95,second=start+.012+this.random()*.026;
    // Two uneven, filtered transients mimic a split ember rather than a
    // quantized electronic click.
    this.noise(.012+this.random()*.016,.025*strength,1800+this.random()*1700,"bandpass","bgm");
    this.noise(.028+this.random()*.024,.018*strength,720+this.random()*620,"lowpass","bgm");
    this.tone(pitch,start,.075,"sine",.045*strength,pitch*.58,"bgm");
    this.tone(pitch*.72,second,.11,"sine",.025*strength,pitch*.34,"bgm");
  }
  setBgm(mode){
    if(this.bgmMode===mode)return;this.stopBgmSchedule();this.bgmMode=mode;this.bgmStep=0;
    if(this.titleAudio)this.titleAudio.pause();
    if(mode==="title"){this.playTitle();return}
    if(mode!=="off"&&this.ctx&&!this.muted){this.bgmNextTime=this.ctx.currentTime+.03;this.scheduleBgm()}
  }
  stopBgmSchedule(){
    clearTimeout(this.bgmTimer);this.bgmTimer=0;
    for(const node of this.bgmNodes){try{node.stop()}catch{}}
    this.bgmNodes.clear();
  }
  scheduleBgm(){
    if(!this.ctx||this.muted||this.bgmMode==="off")return;
    if(this.bgmNextTime<this.ctx.currentTime+.03)this.bgmNextTime=this.ctx.currentTime+.03;
    for(let i=0;i<256;i++){this.bgmPulse(this.bgmNextTime);this.bgmNextTime+=.32}
    const delay=Math.max(1000,(this.bgmNextTime-this.ctx.currentTime-27)*1000);this.bgmTimer=setTimeout(()=>this.scheduleBgm(),delay);
  }
  bgmPulse(t){
    const select=[67,-1,71,-1,74,76,74,-1,71,-1,69,-1,67,-1,64,-1],stage=[57,-1,60,-1,64,-1,62,-1,59,-1,62,-1,60,-1,57,-1],title=[52,-1,-1,55,-1,-1,57,-1,-1,55,-1,-1,52,-1,-1,50],pattern=this.bgmMode==="select"?select:this.bgmMode==="title"?title:stage,note=pattern[this.bgmStep%pattern.length];
    if(note>=0){const bright=this.bgmMode==="select",title=this.bgmMode==="title";this.tone(midi(note),t,title?.9:(bright?.32:.46),title?"sine":"triangle",title?.045:(bright?.105:.14),midi(note)*(title?1.005:(bright?1.01:.98)),"bgm");if(this.bgmStep%8===0)this.tone(midi(note-12),t,title?.95:(.5),"sine",title?.022:(bright?.07:.055),midi(note-12)*.98,"bgm")}
    if(this.bgmMode==="title"&&this.bgmStep%5===2)this.woodCrackle(t+.04,.82+this.random()*.28);
    if(this.bgmStep%13===4)this.forestRustle(t,"bgm");
    if(this.bgmStep%(this.bgmMode==="select"?19:29)===7)this.birdCall(t+.04,this.bgmMode==="select",this.bgmMode==="select"?1:.72,"bgm");
    if(this.bgmMode==="stage"&&this.bgmStep%37===18)this.smallAnimal(t,"bgm");
    this.bgmStep++;
  }
}
