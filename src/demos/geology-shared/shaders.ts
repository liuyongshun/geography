export const vertexShader = `attribute vec2 position; varying vec2 uv; void main(){ uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`

export const fragmentShader = `precision highp float;
uniform sampler2D art;uniform float time;uniform vec2 resolution;uniform float landscape;varying vec2 uv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+7.1;a*=.5;}return v;}
vec3 tex(vec2 p){return texture2D(art,vec2(p.x,1.-p.y)).rgb;}
float hot(vec3 c){return smoothstep(.43,.83,c.r)*smoothstep(.06,.23,c.r-c.g*.75-c.b*.5)*(1.-smoothstep(.25,.58,c.b));}
void main(){
vec2 p=vec2(uv.x,1.-uv.y);vec3 base=tex(p);float mask=hot(base);
float chamber=(1.-smoothstep(.77,1.05,length((p-vec2(.416,.755))/vec2(.239,.17))))*smoothstep(.58,.64,p.y);
float conduit=(1.-smoothstep(.009,.024,abs(p.x-.417)))*smoothstep(.16,.22,p.y)*(1.-smoothstep(.61,.67,p.y));
float surface=(1.-smoothstep(.028,.07,abs(p.y-(.192+(p.x-.428)*.50))))*smoothstep(.425,.46,p.x)*(1.-smoothstep(.81,.86,p.x));
vec2 q=(p-vec2(.416,.755))/vec2(.239,.17);
vec2 swirl=vec2(-q.y,q.x)*.017;swirl+=vec2(sin(q.y*7.+time*.5),cos(q.x*8.-time*.6))*.009;
vec2 velocity=mix(vec2(.003,-.006),swirl,chamber);velocity=mix(velocity,vec2(0.,-.037),conduit);velocity=mix(velocity,vec2(.027,.014),surface);
float phase=fract(time*.22),phase2=fract(time*.22+.5);float blend=abs(phase*2.-1.);
vec2 turbulence=vec2(fbm(p*28.+vec2(0.,time*.26)),fbm(p*31.-vec2(time*.19,0.)))-.5;
vec2 d1=-velocity*phase*3.+turbulence*.008;vec2 d2=-velocity*phase2*3.+turbulence*.008;
vec3 a=tex(p+d1),b=tex(p+d2);vec3 flowed=mix(a,b,blend);
float region=max(mask,max(chamber*.89,conduit*.7));region*=smoothstep(.12,.35,base.r);
// The same flow field advects both the bright melt and the dark crust plates.
vec3 col=mix(base,flowed,region*.88);
vec2 field=p*vec2(82.,66.)-velocity*time*80.;float n=fbm(field+vec2(fbm(field*.55+time*.12)*3.));
float threads=pow(1.-abs(n*2.-1.),10.);
float molten=hot(col);vec3 gold=vec3(1.,.36+.41*threads,.025+.11*threads);
float pulse=.92+.08*sin(time*1.3+p.y*13.)+.045*sin(time*3.4+p.x*21.);
col=mix(col,gold,region*molten*(.14+.24*threads));col*=1.+mask*(pulse-1.);
// Narrow traveling highlights show the upward flow in the conduit.
float rising=pow(.5+.5*sin(p.y*95.+time*6.5),8.);col+=vec3(.15,.075,.008)*conduit*mask*rising;
float glow=0.;vec2 px=1./resolution;glow+=hot(tex(p+vec2(5.,0.)*px));glow+=hot(tex(p-vec2(5.,0.)*px));glow+=hot(tex(p+vec2(0.,5.)*px));glow+=hot(tex(p-vec2(0.,5.)*px));
col+=vec3(.042,.012,.001)*glow*(.76+.24*sin(time*1.6+p.x*11.));
if(landscape>.5){
float water=smoothstep(.018,.09,base.g-base.r)*smoothstep(.025,.12,base.b-base.r)*smoothstep(.26,.34,p.y)*(1.-smoothstep(.57,.62,p.y))*smoothstep(.47,.56,p.x);
vec2 wp=p+vec2(sin(p.y*230.-time*2.5)*.0016,cos(p.x*150.+time*2.)*.0011);
vec3 wet=tex(wp);float ripple=pow(.5+.5*sin(p.y*680.+sin(p.x*160.+time)*2.-time*4.),12.);
col=mix(base,wet+vec3(.08,.16,.18)*ripple*.35,water);
float lava=hot(base)*smoothstep(.69,.8,p.y)*(1.-smoothstep(.25,.32,p.x));
vec3 flowing=tex(p+vec2(sin(time*.6+p.y*19.)*.006,cos(time*.7+p.x*27.)*.009));
col=mix(col,flowing*(1.+.10*sin(time*2.+p.x*23.)),lava*.8);
}
if(landscape>1.5){
float sand=smoothstep(.27,.43,p.y)*(1.-smoothstep(.56,.67,p.y))*smoothstep(.25,.42,p.x);
float dust=fbm(vec2(p.x*31.-time*1.2,p.y*85.+sin(time*.4)));
col=base+vec3(.13,.08,.025)*sand*smoothstep(.42,.8,dust)*(.65+.25*sin(time*.7));
}
gl_FragColor=vec4(col,1.);
}`
