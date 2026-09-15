import { useState, useEffect, useMemo } from 'react';
import emailjs from "@emailjs/browser";
import { supabase } from '../lib/supabaseClient';
import { jsPDF } from 'jspdf';

// =============================================
// HELPERS — RATING Y CLASIFICACIÓN (Punto 7)
// =============================================
function calcularRating(ratings) {
 var vals = Object.values(ratings).filter(function(r) { return r > 0; });
 if (vals.length === 0) return null;
 return parseFloat((vals.reduce(function(a, b) { return a + b; }, 0) / vals.length).toFixed(1));
}

function clasificarRating(rating) {
 if (!rating) return null;
 if (rating >= 4.6) return { label: "Desempeño Distinguido", color: "#166534", bg: "#dcfce7" };
 if (rating >= 3.6) return { label: "Excede las Expectativas", color: "#1e40af", bg: "#dbeafe" };
 if (rating >= 2.6) return { label: "Cumple las Expectativas", color: "#92400e", bg: "#fef3c7" };
 if (rating >= 1.6) return { label: "Por Debajo de lo Esperado", color: "#c2410c", bg: "#ffedd5" };
 return { label: "No Adecuado", color: "#dc2626", bg: "#fee2e2" };
}

function RatingFinalBadge({ ratings }) {
 var rating = calcularRating(ratings);
 var clas = clasificarRating(rating);
 if (!rating) return null;
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: clas.bg, borderRadius: 12, border: '2px solid ' + clas.color, marginTop: 20, marginBottom: 8 }}>
 <div style={{ textAlign: 'center', minWidth: 60 }}>
 <div style={{ fontSize: 32, fontWeight: 700, color: clas.color }}>{rating}</div>
 <div style={{ fontSize: 10, color: clas.color, fontWeight: 600 }}>RATING</div>
 </div>
 <div>
 <div style={{ fontSize: 15, fontWeight: 700, color: clas.color }}>{clas.label}</div>
 <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Promedio de {Object.values(ratings).filter(function(r) { return r > 0; }).length} competencias evaluadas</div>
 </div>
 </div>
 );
}


// =============================================
// COMPONENTE PRINCIPAL
// =============================================
async function crearNotificacion(liderId, tipo, mensaje, origenId, origenNombre) {
 if (!liderId) return;
 await supabase.from("notificaciones").insert({ user_id: liderId, tipo: tipo, mensaje: mensaje, origen_id: origenId || null, origen_nombre: origenNombre || null });
}

async function enviarEmailNotificacion(toEmail, toName, subject, message) {
 try {
 await emailjs.send(
 "service_xfgapna",
 "template_xs3nenc",
 { to_email: toEmail, to_name: toName, subject: subject, message: message },
 "Mc-YPiWB1XNBKfhOJ"
 );
 console.log("Email enviado a", toEmail);
 } catch (err) {
 console.warn("Error enviando email:", err);
 }
}
export default function PanelApp() {
 var [profile, setProfile] = useState(null);
 var [loading, setLoading] = useState(true);
 var [menuActivo, setMenuActivo] = useState('desempeno');
 var [cicloActivo, setCicloActivo] = useState(null);
 var [vistaComoColaborador, setVistaComoColaborador] = useState(false);
 var [modulosVistaColab, setModulosVistaColab] = useState([]);
 var [modulosActivos, setModulosActivos] = useState([]);
 var [notifs, setNotifs] = useState([]);
  var [notifsActivas, setNotifsActivas] = useState(true);
 var [showNotifs, setShowNotifs] = useState(false);

 useEffect(function() { cargarPerfil(); }, []);
  useEffect(function() { try { var val = localStorage.getItem("notifsActivas"); if (val === "false") setNotifsActivas(false); } catch(e) {} }, []);

 async function cargarPerfil() {
 var { data: { session } } = await supabase.auth.getSession();
 if (!session) { window.location.href = '/'; return; }
 var { data: perfil } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, role, activo, leader_id').eq('id', session.user.id).single();
 if (perfil && perfil.activo === false) { await supabase.auth.signOut(); alert('Cuenta desactivada.'); window.location.href = '/'; return; }
 // Cargar módulos desde BD para todos
 var { data: mods } = await supabase.from('modulos_usuario').select('modulo').eq('user_id', perfil.id).eq('activo', true);
 var modulosCargados = (mods || []).map(function(m) { return m.modulo; });
 // Si admin y no tiene módulos en BD, darle todos por defecto
 if (perfil.role === 'admin_rrhh' && modulosCargados.length === 0) {
   modulosCargados = ['desempeno', 'obj_individual', 'obj_compania', 'capacitaciones'];
 }
 setModulosActivos(modulosCargados);
 setProfile(perfil); setLoading(false);
 cargarNotifs(perfil.id);
 }

 async function cerrarSesion() { await supabase.auth.signOut(); window.location.href = '/'; }

 async function cargarNotifs(userId) {
 var { data } = await supabase.from("notificaciones").select("*").eq("user_id", userId).eq("leida", false).order("created_at", { ascending: false }).limit(20);
 setNotifs(data || []);
 }

 async function marcarLeida(id) {
 await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
 setNotifs(function(prev) { return prev.filter(function(n) { return n.id !== id; }); });
 }

 async function marcarTodasLeidas(userId) {
 await supabase.from("notificaciones").update({ leida: true }).eq("user_id", userId).eq("leida", false);
 setNotifs([]);
 }

  function toggleNotifsActivas() {
    var nuevo = !notifsActivas;
    setNotifsActivas(nuevo);
    try { localStorage.setItem("notifsActivas", String(nuevo)); } catch(e) {}
  }


 if (loading) return <div style={s.centrado}><p>Cargando...</p></div>;
 if (!profile) return <div style={s.centrado}><h2>Error</h2><button onClick={cerrarSesion} style={s.btnSalir}>Volver</button></div>;

 var esAdmin = profile.role === 'admin_rrhh';
 var esSuperAdmin = profile.email === 'florencia.salvaneschi@grupo-fabric.com' || profile.email === 'adrian.galvan@grupo-fabric.com';
 var esGerente = profile.seniority === 'Gerente';
 var tieneEquipo = profile.role === 'admin_rrhh' || profile.role === 'lider' || esGerente;

 var rolEfectivo = (esAdmin && vistaComoColaborador) ? 'colaborador' : profile.role;
 var nombreRol = rolEfectivo === 'admin_rrhh' ? 'Admin RRHH' : rolEfectivo === 'lider' ? 'Lider' : 'Colaborador';
 var emojiRol = rolEfectivo === 'admin_rrhh' ? '' : rolEfectivo === 'lider' ? '' : '';
 var profileEfectivo = { ...profile, role: rolEfectivo };

 // Módulos visibles — admin ve todo, resto según tabla
 var modulosVer = esAdmin && !vistaComoColaborador
 ? ['desempeno', 'obj_individual', 'obj_compania', 'capacitaciones', 'dashboard_global']
 : modulosActivos;

 var verDesempeno = modulosVer.includes('desempeno');
 var verObjIndividual = modulosVer.includes('obj_individual');
 var verObjCompania = modulosVer.includes('obj_compania');
 var verAlgunObj = verObjIndividual || verObjCompania;
  var verCapacitaciones = !esAdmin ? modulosActivos.includes("capacitaciones") : (vistaComoColaborador ? modulosVistaColab.includes("capacitaciones") : true);

 return (
 <div style={{ display: 'flex', minHeight: '100vh' }}>
 <aside style={sidebarStyle.aside}>
 <div style={sidebarStyle.logoContainer}><img src="/logo.jpg" alt="Fabric Group" style={{ height: '40px' }} /></div>
 <nav style={sidebarStyle.nav}>
 {/* DESEMPEÑO */}
          {esSuperAdmin && !vistaComoColaborador && <button onClick={function() { setMenuActivo('dashboard_global'); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === 'dashboard_global' ? '#D4D2C6' : 'transparent', color: menuActivo === 'dashboard_global' ? '#231F20' : '#D4D2C6' }}>DASHBOARD</button>}
          {verDesempeno && <button onClick={function() { setMenuActivo('desempeno'); setCicloActivo(null); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === 'desempeno' ? '#D4D2C6' : 'transparent', color: menuActivo === 'desempeno' ? '#231F20' : '#D4D2C6' }}>DESEMPEÑO</button>}
 {/* OBJETIVOS */}
 {verAlgunObj && (
 <button onClick={function() { setMenuActivo(menuActivo === 'objetivos' || menuActivo === 'miequipo_obj' || menuActivo === 'misobjetivos' || menuActivo === 'compania_obj' || menuActivo === 'admin_obj' ? '' : 'objetivos'); }} style={{ ...sidebarStyle.menuItem, background: (menuActivo === 'objetivos' || menuActivo === 'miequipo_obj' || menuActivo === 'misobjetivos' || menuActivo === 'compania_obj' || menuActivo === 'admin_obj') ? '#D4D2C6' : 'transparent', color: (menuActivo === 'objetivos' || menuActivo === 'miequipo_obj' || menuActivo === 'misobjetivos' || menuActivo === 'compania_obj' || menuActivo === 'admin_obj') ? '#231F20' : '#D4D2C6' }}>OBJETIVOS {(menuActivo === 'objetivos' || menuActivo === 'miequipo_obj' || menuActivo === 'misobjetivos' || menuActivo === 'compania_obj' || menuActivo === 'admin_obj') ? '▼' : '▶'}</button>
 )}
 {verAlgunObj && (menuActivo === 'objetivos' || menuActivo === 'miequipo_obj' || menuActivo === 'misobjetivos' || menuActivo === 'compania_obj' || menuActivo === 'admin_obj') && (
 <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
 {verObjIndividual && <button onClick={function() { setMenuActivo('misobjetivos'); }} style={{ ...sidebarStyle.subMenuItem, background: menuActivo === 'misobjetivos' ? '#D4D2C6' : 'transparent', color: menuActivo === 'misobjetivos' ? '#231F20' : '#D4D2C6' }}>Mis Objetivos</button>}
 {verObjIndividual && tieneEquipo && <button onClick={function() { setMenuActivo('miequipo_obj'); }} style={{ ...sidebarStyle.subMenuItem, background: menuActivo === 'miequipo_obj' ? '#D4D2C6' : 'transparent', color: menuActivo === 'miequipo_obj' ? '#231F20' : '#D4D2C6' }}>Mi Equipo</button>}
 {verObjCompania && <button onClick={function() { setMenuActivo('compania_obj'); }} style={{ ...sidebarStyle.subMenuItem, background: menuActivo === 'compania_obj' ? '#D4D2C6' : 'transparent', color: menuActivo === 'compania_obj' ? '#231F20' : '#D4D2C6' }}>Compañia</button>}
 {esSuperAdmin && !vistaComoColaborador && <button onClick={function() { setMenuActivo('admin_obj'); }} style={{ ...sidebarStyle.subMenuItem, background: menuActivo === 'admin_obj' ? '#D4D2C6' : 'transparent', color: menuActivo === 'admin_obj' ? '#231F20' : '#D4D2C6', fontWeight: 600 }}>Panel Admin</button>}
 </div>
 )}
 {esSuperAdmin && !vistaComoColaborador && <button onClick={function() { setMenuActivo("gestion_usuarios"); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === "gestion_usuarios" ? "#D4D2C6" : "transparent", color: menuActivo === "gestion_usuarios" ? "#231F20" : "#D4D2C6", borderTop: "1px solid rgba(212,210,198,0.2)", fontWeight: 600 }}>USUARIOS</button>}
 {esSuperAdmin && !vistaComoColaborador && <button onClick={function() { setMenuActivo("gestion_visibilidad"); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === "gestion_visibilidad" ? "#D4D2C6" : "transparent", color: menuActivo === "gestion_visibilidad" ? "#231F20" : "#D4D2C6", fontWeight: 600 }}>VISIBILIDAD</button>}
 {esSuperAdmin && !vistaComoColaborador && <button onClick={function() { setMenuActivo("gestion_modulos"); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === "gestion_modulos" ? "#D4D2C6" : "transparent", color: menuActivo === "gestion_modulos" ? "#231F20" : "#D4D2C6", marginTop: 8, borderTop: "1px solid rgba(212,210,198,0.2)", fontWeight: 600 }}>MODULOS</button>}
          {verCapacitaciones && (
            <button onClick={function() { setMenuActivo("capacitaciones"); }} style={{ ...sidebarStyle.menuItem, background: menuActivo === "capacitaciones" ? "#D4D2C6" : "transparent", color: menuActivo === "capacitaciones" ? "#231F20" : "#D4D2C6" }}>CAPACITACIONES</button>
          )}
 </nav>
  <div style={sidebarStyle.footer}>
    {esSuperAdmin && (
      <div style={{ marginBottom: 10, padding: "8px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: notifsActivas ? "#86efac" : "#94a3b8", fontWeight: 600 }}>Notificaciones {notifsActivas ? "ON" : "OFF"}</span>
          <button onClick={toggleNotifsActivas} style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: notifsActivas ? "#166534" : "#475569", position: "relative", transition: "background 0.2s" }}>
            <span style={{ position: "absolute", top: 2, left: notifsActivas ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
          </button>
        </div>
      </div>
    )}
    <span style={{ fontSize: 12, color: "#D4D2C6" }}>{profile.email}</span>
    <button onClick={cerrarSesion} style={{ ...s.btnSalir, marginTop: 8, width: "100%" }}>Cerrar Sesion</button>
  </div>
 </aside>

 <div style={{ flex: 1, background: '#f8fafc', minHeight: '100vh' }}>
 <header style={s.header}>
 <h1 style={{ fontSize: 18, fontWeight: 600, color: '#D4D2C6', margin: 0 }}>Fabric Group</h1>
 <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
 {esAdmin && !vistaComoColaborador && (
 <button onClick={async function() { var { data: mods } = await supabase.from('modulos_usuario').select('modulo').eq('user_id', profile.id).eq('activo', true); setModulosVistaColab((mods || []).map(function(m) { return m.modulo; })); setVistaComoColaborador(true); setMenuActivo('desempeno'); setCicloActivo(null); }} style={{ padding: '6px 14px', background: '#D4D2C6', color: '#231F20', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
 Ver como Colaborador
 </button>
 )}
 {esAdmin && vistaComoColaborador && (
 <button onClick={function() { setVistaComoColaborador(false); setMenuActivo('desempeno'); setCicloActivo(null); }} style={{ padding: '6px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
 Volver a Admin
 </button>
 )}
 {/* Campanita de notificaciones */}
 <div style={{ position: "relative" }}>
 <button onClick={function() { setShowNotifs(!showNotifs); }} style={{ position: "relative", background: "transparent", border: "1px solid rgba(212,210,198,0.4)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: "#D4D2C6", fontSize: 18 }}> 🔔

 {notifs.length > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifs.length > 9 ? "9+" : notifs.length}</span>}
 </button>
 {showNotifs && (
 <div style={{ position: "absolute", right: 0, top: "110%", width: 340, background: "white", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid #e8e6e0", zIndex: 1000, overflow: "hidden" }} onClick={function(e) { e.stopPropagation(); }}>
 <div style={{ padding: "14px 16px", borderBottom: "1px solid #e8e6e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <strong style={{ color: "#231F20", fontSize: 14 }}>Notificaciones {notifs.length > 0 ? "(" + notifs.length + ")" : ""}</strong>
 {notifs.length > 0 && <button onClick={function() { marcarTodasLeidas(profile.id); }} style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Marcar todas como leídas</button>}
 </div>
 {notifs.length === 0 ? (
 <p style={{ textAlign: "center", padding: "24px 16px", color: "#94a3b8", fontSize: 13, margin: 0 }}>Sin notificaciones nuevas</p>
 ) : (
 <div style={{ maxHeight: 360, overflowY: "auto" }}>
 {notifs.map(function(n) {
 return (
 <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f0ec", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
 <div style={{ flex: 1 }}>
 <p style={{ margin: "0 0 4px 0", fontSize: 13, color: "#231F20", lineHeight: 1.4 }}>{n.mensaje}</p>
 <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(n.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
 </div>
 <button onClick={function() { marcarLeida(n.id); }} style={{ background: "none", border: "1px solid #e8e6e0", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Leída</button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </div>
 <span style={s.badge}>{emojiRol} {profile.puesto || nombreRol}</span>
 </div>
 </header>

 {vistaComoColaborador && (
 <div style={{ padding: '10px 24px', background: '#fef3c7', borderBottom: '2px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
 <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>️ Estas viendo la plataforma como colaborador.</span>
 <button onClick={function() { setVistaComoColaborador(false); setMenuActivo('desempeno'); setCicloActivo(null); }} style={{ padding: '4px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Salir</button>
 </div>
 )}

 <main style={{ padding: 24 }}>
 {menuActivo === 'desempeno' && verDesempeno && <DesempenoView profile={profileEfectivo} cicloActivo={cicloActivo} setCicloActivo={setCicloActivo} />}
          {menuActivo === "dashboard_global" && esSuperAdmin && !vistaComoColaborador && <DashboardGlobal />}
 {menuActivo === 'misobjetivos' && verObjIndividual && <ObjetivosColaborador profile={profile} />}
 {menuActivo === 'miequipo_obj' && verObjIndividual && <ObjetivosGerente profile={profile} />}
 {menuActivo === 'compania_obj' && verObjCompania && <ObjetivosCompania esAdmin={esAdmin && !vistaComoColaborador} />}
          {menuActivo === "capacitaciones" && verCapacitaciones && <ModuloCapacitaciones profile={profileEfectivo} esAdmin={esAdmin && !vistaComoColaborador} />}
 {menuActivo === 'admin_obj' && !vistaComoColaborador && esSuperAdmin && <PanelAdminObjetivos profile={profile} />}
 {menuActivo === 'gestion_modulos' && !vistaComoColaborador && esSuperAdmin && <GestionModulos />}
 {menuActivo === 'gestion_visibilidad' && !vistaComoColaborador && esSuperAdmin && <GestionVisibilidad />}
 {menuActivo === 'gestion_usuarios' && !vistaComoColaborador && esSuperAdmin && <GestionUsuarios />}
 {!verDesempeno && !verAlgunObj && (
 <div style={{ ...s.tarjetaStat, textAlign: 'center', padding: 60 }}>
 <p style={{ fontSize: 40, marginBottom: 16 }}></p>
 <h3 style={{ color: '#231F20' }}>Sin modulos habilitados</h3>
 <p style={{ color: '#64748b' }}>Tu administrador aun no habilitó ningún módulo para tu perfil.</p>
 </div>
 )}
 </main>
 </div>
 </div>
 );
}


// =============================================
// VISTAS AUXILIARES
// =============================================
function PlaceholderView({ titulo, descripcion }) { return <div style={{ ...s.tarjetaStat, textAlign: 'center', padding: 60 }}><h2>{titulo}</h2><p>{descripcion}</p></div>; }

function DesempenoView({ profile, cicloActivo, setCicloActivo }) {
 var esAdmin = profile.role === 'admin_rrhh';
 var esGerente = profile.seniority === 'Gerente';
 if (!cicloActivo) return <CiclosLista esAdmin={esAdmin} onSelectCiclo={setCicloActivo} profile={profile} />;
 var soloLectura = cicloActivo.estado === 'cerrado' && !esAdmin;
 return (
 <div>
 <button onClick={function() { setCicloActivo(null); }} style={{ ...s.btnInfo, marginBottom: 16 }}>Volver a Ciclos</button>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
 <h2 style={{ color: '#231F20', margin: 0 }}> {cicloActivo.nombre}</h2>
 <span style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: cicloActivo.estado === 'activo' ? '#dcfce7' : '#fee2e2', color: cicloActivo.estado === 'activo' ? '#166534' : '#dc2626' }}>{cicloActivo.estado === 'activo' ? ' Abierto' : ' Cerrado'}</span>
 </div>
 <p style={{ color: '#64748b', marginBottom: 8 }}>{new Date(cicloActivo.fecha_inicio).toLocaleDateString('es-AR')}{cicloActivo.fecha_fin ? ' - ' + new Date(cicloActivo.fecha_fin).toLocaleDateString('es-AR') : ''}</p>
 {soloLectura && <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16, color: '#92400e', fontSize: 14, textAlign: 'center' }}> Este ciclo esta cerrado. Solo puedes ver la informacion en modo lectura.</div>}
 {esAdmin && <PanelAdminConEquipo profile={profile} cicloId={cicloActivo.id} tieneAutoevaluacion={!esGerente} cicloEstado={cicloActivo.estado} />}
 {!esAdmin && esGerente && <EquipoLider cicloId={cicloActivo.id} profile={profile} soloLectura={soloLectura} />}
 {!esAdmin && !esGerente && profile.role === 'lider' && <PanelLiderConAutoevaluacion cicloId={cicloActivo.id} profile={profile} soloLectura={soloLectura} />}
 {!esAdmin && !esGerente && profile.role !== 'lider' && <PanelColaboradorConEquipo userId={profile.id} seniority={profile.seniority} cicloId={cicloActivo.id} profile={profile} soloLectura={soloLectura} />}
 </div>
 );
}

function PanelLiderConAutoevaluacion({ cicloId, profile, soloLectura }) { var [v, setV] = useState('equipo'); return <div><div style={{ display: 'flex', gap: 12, marginBottom: 20 }}><button onClick={function() { setV('equipo'); }} style={v === 'equipo' ? s.btnPrimario : s.btnInfo}>Mi Equipo</button><button onClick={function() { setV('mievaluacion'); }} style={v === 'mievaluacion' ? s.btnPrimario : s.btnInfo}>Mi Evaluacion</button></div>{v === 'equipo' ? <EquipoLider cicloId={cicloId} profile={profile} soloLectura={soloLectura} /> : <PanelColaborador userId={profile.id} seniority={profile.seniority} puesto={profile.puesto} cicloId={cicloId} soloLectura={soloLectura} />}</div>; }
function CiclosLista({ esAdmin, onSelectCiclo, profile }) {
 var [ciclos, setCiclos] = useState([]); var [carg, setCarg] = useState(true); var [showC, setShowC] = useState(false);
 var [nom, setNom] = useState(''); var [fIni, setFIni] = useState(''); var [fFin, setFFin] = useState('');
 var [cGestion, setCGestion] = useState(null); var [todos, setTodos] = useState([]); var [parts, setParts] = useState([]);
 var esSuperAdmin = profile && (profile.email === 'florencia.salvaneschi@grupo-fabric.com' || profile.email === 'adrian.galvan@grupo-fabric.com');
 useEffect(function() { cargarCiclos(); if (esAdmin) cargarColabs(); }, []);
 async function cargarCiclos() { var { data } = await supabase.from('ciclos').select('*').order('fecha_inicio', { ascending: false }); setCiclos(data || []); setCarg(false); }
 async function cargarColabs() { var { data } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, role').eq('activo', true).or("role.neq.admin_rrhh,email.eq.florencia.salvaneschi@grupo-fabric.com,email.eq.adrian.galvan@grupo-fabric.com"); setTodos(data || []); }
 async function crearCiclo() { if (!nom || !fIni) return alert('Nombre y fecha obligatorios'); await supabase.from('ciclos').insert({ nombre: nom, fecha_inicio: fIni, fecha_fin: fFin || null, estado: 'activo' }); setNom(''); setFIni(''); setFFin(''); setShowC(false); cargarCiclos(); }
 async function toggleCiclo(ciclo) { await supabase.from('ciclos').update({ estado: ciclo.estado === 'activo' ? 'cerrado' : 'activo' }).eq('id', ciclo.id); cargarCiclos(); }
 async function abrirGestion(ciclo) { setCGestion(ciclo.id); var { data } = await supabase.from("ciclo_colaboradores").select("colaborador_id").eq("ciclo_id", ciclo.id); setParts((data || []).map(function(p) { return p.colaborador_id; })); }
 async function togglePart(cid) { if (parts.includes(cid)) { await supabase.from("ciclo_colaboradores").delete().eq("ciclo_id", cGestion).eq("colaborador_id", cid); setParts(function(p) { return p.filter(function(id) { return id !== cid; }); }); } else { await supabase.from("ciclo_colaboradores").insert({ ciclo_id: cGestion, colaborador_id: cid }); setParts(function(p) { return [...p, cid]; }); } }
 async function eliminarCiclo(ciclo) {
 if (typeof window !== 'undefined' && !window.confirm('Eliminar el ciclo ' + ciclo.nombre + '. Se eliminarán también todos sus participantes. Esta acción no se puede deshacer.')) return;
 var cicloId = ciclo.id;
 // 1. Puntuaciones (dependen de evaluaciones)
 var { data: evs } = await supabase.from('evaluaciones').select('id').eq('ciclo_id', cicloId);
 var evIds = (evs || []).map(function(e) { return e.id; });
 if (evIds.length > 0) await supabase.from('puntuaciones').delete().in('evaluacion_id', evIds);
 // 2. Tablas que dependen de ciclos
 await supabase.from('evaluaciones').delete().eq('ciclo_id', cicloId);
 await supabase.from('feedback').delete().eq('ciclo_id', cicloId);
 await supabase.from('ciclo_colaboradores').delete().eq('ciclo_id', cicloId);
 // 3. Ciclo
 var { error } = await supabase.from('ciclos').delete().eq('id', cicloId);
 if (error) { alert('Error al eliminar: ' + error.message); return; }
 cargarCiclos();
 }
 if (carg) return <p style={{ color: '#64748b', padding: 40 }}>Cargando ciclos...</p>;
 var inp = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', boxSizing: 'border-box' };
 return (
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
 <div><h2 style={{ color: '#231F20', margin: '0 0 4px 0', fontSize: 22, fontWeight: 700 }}>Ciclos de Evaluación de Desempeño</h2><p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>{ciclos.length} ciclo{ciclos.length !== 1 ? 's' : ''} registrado{ciclos.length !== 1 ? 's' : ''}</p></div>
 {esAdmin && <button onClick={function() { setShowC(!showC); }} style={s.btnPrimario}>Nuevo ciclo</button>}
 </div>
 {showC && (<div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 20, marginBottom: 20 }}><h4 style={{ margin: '0 0 16px 0', color: '#231F20' }}>Crear nuevo ciclo</h4><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}><div style={{ flex: 2, minWidth: 180 }}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nombre *</label><input value={nom} onChange={function(e) { setNom(e.target.value); }} placeholder="Ej: 1er Semestre 2026" style={{ ...inp, width: '100%' }} /></div><div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Inicio *</label><input type="date" value={fIni} onChange={function(e) { setFIni(e.target.value); }} style={inp} /></div><div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Fin</label><input type="date" value={fFin} onChange={function(e) { setFFin(e.target.value); }} style={inp} /></div><button onClick={crearCiclo} style={{ ...s.btnPrimario, background: '#166534' }}>Crear</button><button onClick={function() { setShowC(false); }} style={s.btnSecundario}>Cancelar</button></div></div>)}
 {cGestion && (<div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 20, marginBottom: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><div><h4 style={{ margin: 0, color: '#231F20' }}>Seleccionar Participantes</h4><p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>{parts.length} seleccionado{parts.length !== 1 ? 's' : ''}</p></div><button onClick={function() { setCGestion(null); }} style={s.btnInfo}>Cerrar</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, maxHeight: 320, overflowY: 'auto' }}>{todos.map(function(c) { var sel = parts.includes(c.id); return (<div key={c.id} onClick={function() { togglePart(c.id); }} style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: sel ? '#231F20' : '#F0EDE8', color: sel ? '#D4D2C6' : '#231F20', border: '1px solid ' + (sel ? '#231F20' : '#e8e6e0') }}><div><strong style={{ fontSize: 13, display: 'block' }}>{c.full_name || c.email}</strong><span style={{ fontSize: 11, opacity: 0.7 }}>{c.puesto || c.area}</span></div><span style={{ fontSize: 14, fontWeight: 700 }}>{sel ? '' : '○'}</span></div>); })}</div></div>)}
 {ciclos.length === 0 ? (<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e8e6e0' }}>No hay ciclos creados.</div>) : (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
 {ciclos.map(function(ciclo) { var abierto = ciclo.estado === 'activo'; return (
 <div key={ciclo.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderTop: '3px solid ' + (abierto ? '#231F20' : '#D4D2C6'), padding: '20px 22px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}><h3 style={{ color: '#231F20', margin: 0, fontSize: 17, fontWeight: 700 }}>{ciclo.nombre}</h3><span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: abierto ? '#dcfce7' : '#f1f5f9', color: abierto ? '#166534' : '#64748b', flexShrink: 0, marginLeft: 8 }}>{abierto ? 'Abierto' : 'Cerrado'}</span></div>
 <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 4px 0' }}>Inicio: {new Date(ciclo.fecha_inicio).toLocaleDateString('es-AR')}</p>
 {ciclo.fecha_fin && <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px 0' }}>Fin: {new Date(ciclo.fecha_fin).toLocaleDateString('es-AR')}</p>}
 <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
 <button onClick={function() { onSelectCiclo(ciclo); }} style={{ ...s.btnPrimario, flex: 1, textAlign: 'center' }}>{ciclo.estado === 'cerrado' && !esAdmin ? 'Ver' : 'Entrar'}</button>
 {esAdmin && <button onClick={function() { abrirGestion(ciclo); }} style={s.btnInfo}>Participantes</button>}
 {esSuperAdmin && <button onClick={function() { toggleCiclo(ciclo); }} style={{ ...s.btnInfo, color: abierto ? "#dc2626" : "#166534", borderColor: abierto ? "#fca5a5" : "#86efac", background: abierto ? "#fee2e2" : "#dcfce7" }}>{abierto ? "Cerrar" : "Abrir"}</button>}
 {esSuperAdmin && <button onClick={function() { eliminarCiclo(ciclo); }} style={{ ...s.btnInfo, color: "#dc2626", borderColor: "#fca5a5", background: "#fee2e2" }}>Eliminar</button>}
 </div>
 </div>
 ); })}
 </div>
 )}
 </div>
 );
}


function PanelAdminConEquipo({ profile, cicloId, tieneAutoevaluacion, cicloEstado }) {
 var [vista, setVista] = useState('dashboard'); var [stats, setStats] = useState({ total: 0, enviadas: 0, pendientes: 0 }); var [colabs, setColabs] = useState([]); var [hist, setHist] = useState(null);
 useEffect(function() { cargar(); }, [cicloId]);
 async function cargar() {
 var [{ count: t }, { count: e }, { data: p }, { data: f }, { data: evs }, { data: punts }] = await Promise.all([
 supabase.from('evaluaciones').select('*', { count: 'exact', head: true }).eq('ciclo_id', cicloId),
 supabase.from('evaluaciones').select('*', { count: 'exact', head: true }).eq('ciclo_id', cicloId).eq('estado', 'enviado'),
 supabase.from('ciclo_colaboradores').select('colaborador_id').eq('ciclo_id', cicloId),
 supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, role, activo').or('role.neq.admin_rrhh,email.eq.florencia.salvaneschi@grupo-fabric.com,email.eq.adrian.galvan@grupo-fabric.com').eq('activo', true),
 supabase.from('evaluaciones').select('id, colaborador_id, ciclo_id, tipo_evaluacion, rating_promedio, rating_calibrado, estado').eq('ciclo_id', cicloId),
 supabase.from('puntuaciones').select('evaluacion_id, competencia_id, rating, competencias(nombre)'),
 ]);
 var ids = (p || []).map(function(x) { return x.colaborador_id; });
 var colabsFiltrados = (f || []).filter(function(c) { return ids.includes(c.id); });
 setColabs(colabsFiltrados);
 setStats({ total: t || 0, enviadas: e || 0, pendientes: (t || 0) - (e || 0), evaluaciones: evs || [], puntuaciones: punts || [], perfiles: colabsFiltrados });
 }
 if (hist) return <HistorialAdmin colaborador={hist} onVolver={function() { setHist(null); }} />;
 return (
 <div>
 <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
 <button onClick={function() { setVista('evaluaciones'); }} style={vista === 'evaluaciones' ? s.btnPrimario : s.btnInfo}>Ver Evaluaciones</button>
 <button onClick={function() { setVista('calibracion'); }} style={vista === 'calibracion' ? s.btnPrimario : s.btnInfo}> Calibracion</button>
 <button onClick={function() { setVista('feedback'); }} style={vista === 'feedback' ? s.btnPrimario : s.btnInfo}> Feedback</button>
 <button onClick={function() { setVista('equipo'); }} style={vista === 'equipo' ? s.btnPrimario : s.btnInfo}>Mi Equipo</button>
 {tieneAutoevaluacion && <button onClick={function() { setVista('mievaluacion'); }} style={vista === 'mievaluacion' ? s.btnPrimario : s.btnInfo}>Mi Evaluacion</button>}
 <button onClick={function() { setVista('colaboradores'); }} style={vista === 'colaboradores' ? s.btnPrimario : s.btnInfo}>Participantes</button>
 <button onClick={function() { setVista('modulos'); }} style={vista === 'modulos' ? s.btnPrimario : s.btnInfo}>Modulos</button>
 </div>
 {vista === 'evaluaciones' && <EvaluacionesAdmin cicloId={cicloId} />}
 {vista === 'calibracion' && <PanelCalibracion cicloId={cicloId} colabs={colabs} onHist={setHist} soloLectura={cicloEstado === 'cerrado'} />}
 {vista === 'feedback' && <FeedbackAdmin cicloId={cicloId} />}
 {vista === 'equipo' && <EquipoLider cicloId={cicloId} profile={profile} soloLectura={false} />}
 {vista === 'mievaluacion' && tieneAutoevaluacion && <PanelColaborador userId={profile.id} seniority={profile.seniority} puesto={profile.puesto} cicloId={cicloId} soloLectura={false} />}
 {vista === 'colaboradores' && <ParticipantesView colabs={colabs} />}
 {vista === 'modulos' && <GestionModulos />}
 </div>
 );
}

function PanelColaboradorConEquipo({ userId, seniority, cicloId, profile, soloLectura }) {
 var [v, setV] = useState('autoevaluacion'); var [tieneEq, setTieneEq] = useState(false); var [part, setPart] = useState(false); var [verif, setVerif] = useState(true);
 useEffect(function() { (async function() { var { data: { session } } = await supabase.auth.getSession(); if (session) { var [{ count: e }, { count: p }] = await Promise.all([supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('leader_id', session.user.id).eq('activo', true), supabase.from('ciclo_colaboradores').select('*', { count: 'exact', head: true }).eq('ciclo_id', cicloId).eq('colaborador_id', session.user.id)]); setTieneEq((e || 0) > 0); setPart((p || 0) > 0); } setVerif(false); })(); }, [cicloId]);
 if (verif) return <p>Verificando...</p>; if (!part) return <div style={{ ...s.tarjetaStat, textAlign: 'center', padding: 40 }}><p>No estas participando en este ciclo.</p></div>;
 return <div><div style={{ display: 'flex', gap: 12, marginBottom: 20 }}><button onClick={function() { setV('autoevaluacion'); }} style={v === 'autoevaluacion' ? s.btnPrimario : s.btnInfo}>Mi Evaluacion</button>{tieneEq && <button onClick={function() { setV('equipo'); }} style={v === 'equipo' ? s.btnPrimario : s.btnInfo}>Mi Equipo</button>}</div>{v === 'autoevaluacion' ? <PanelColaborador userId={userId} seniority={seniority} puesto={profile?.puesto} cicloId={cicloId} soloLectura={soloLectura} /> : <EquipoLider cicloId={cicloId} profile={profile} soloLectura={soloLectura} />}</div>;
}

// =============================================
function DashboardGlobal() {
  var [tabActivo, setTabActivo] = useState('desempeno');
  var [statsDesempeno, setStatsDesempeno] = useState({ evaluaciones: [], puntuaciones: [], perfiles: [] });
  var [colabs, setColabs] = useState([]);
  var [ciclos, setCiclos] = useState([]);
  // Objetivos
  var [objetivosData, setObjetivosData] = useState([]);
  var [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());
  var [filtroAreaObj, setFiltroAreaObj] = useState('Todas');
  var [filtroColabObj, setFiltroColabObj] = useState('Todos');
  var [cargando, setCargando] = useState(true);
  var [filtroAreaDesemp, setFiltroAreaDesemp] = useState("Todas");
  var [filtroSeniorityDesemp, setFiltroSeniorityDesemp] = useState("Todos");
  var [filtroColabDesemp, setFiltroColabDesemp] = useState("Todos");
  var [filtroCicloDesemp, setFiltroCicloDesemp] = useState("Todos");

  useEffect(function() { cargarTodo(); }, []);

  async function cargarTodo() {
    setCargando(true);
    var [
      { data: perfiles },
      { data: evs },
      { data: punts },
      { data: cics },
      { data: objs },
    ] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, area, seniority').eq('activo', true),
      supabase.from('evaluaciones').select('id, colaborador_id, ciclo_id, tipo_evaluacion, rating_promedio, rating_calibrado, estado'),
      supabase.from('puntuaciones').select('evaluacion_id, rating, competencias(nombre)'),
      supabase.from('ciclos').select('id, nombre').order('fecha_inicio', { ascending: false }),
      supabase.from('objetivos').select('id, colaborador_id, corporativo, ponderacion, status, alcance_completado, alcance_validado, anio').order('created_at'),
    ]);
    setStatsDesempeno({ evaluaciones: evs || [], puntuaciones: punts || [], perfiles: perfiles || [] });
    setColabs(perfiles || []);
    setCiclos(cics || []);
    setObjetivosData(objs || []);
    setCargando(false);
  }

  if (cargando) return <p style={{ padding: 40, color: '#64748b' }}>Cargando dashboard...</p>;

  // Opciones de filtro para desempeño
  var areasDesemp = ['Todas'].concat([...new Set(colabs.map(function(c) { return c.area; }).filter(Boolean))].sort());
  var senioritiesDesemp = ['Todos'].concat([...new Set(colabs.map(function(c) { return c.seniority; }).filter(Boolean))].sort());
  var ciclosOpts = [{ id: 'Todos', nombre: 'Todos los ciclos' }].concat(ciclos);

  // Perfiles filtrados para desempeño
  var colabsFiltradosDesemp = colabs.filter(function(c) {
    if (filtroAreaDesemp !== 'Todas' && c.area !== filtroAreaDesemp) return false;
    if (filtroSeniorityDesemp !== 'Todos' && c.seniority !== filtroSeniorityDesemp) return false;
    if (filtroColabDesemp !== 'Todos' && c.id !== filtroColabDesemp) return false;
    return true;
  });
  var idsDesemp = colabsFiltradosDesemp.map(function(c) { return c.id; });

  // Evaluaciones filtradas
  var evsFiltradas = (statsDesempeno.evaluaciones || []).filter(function(e) {
    if (!idsDesemp.includes(e.colaborador_id)) return false;
    if (filtroCicloDesemp !== 'Todos' && String(e.ciclo_id) !== String(filtroCicloDesemp)) return false;
    return true;
  });

  // Gráfico araña — solo evaluaciones filtradas del líder
  var compMap = {};
  var evsLiderIds = evsFiltradas.filter(function(e) { return e.tipo_evaluacion === 'evaluacion_lider' && e.rating_calibrado; }).map(function(e) { return e.id; });
  (statsDesempeno.puntuaciones || []).forEach(function(p) {
    if (!evsLiderIds.includes(p.evaluacion_id)) return;
    var nombre = p.competencias?.nombre;
    if (!nombre || !p.rating) return;
    if (!compMap[nombre]) compMap[nombre] = { sum: 0, count: 0 };
    compMap[nombre].sum += parseFloat(p.rating);
    compMap[nombre].count++;
  });
  var compData = Object.entries(compMap).map(function(e) { return { nombre: e[0], prom: e[1].sum / e[1].count }; }).sort(function(a,b) { return b.prom - a.prom; });

  // Distribución desempeño — filtrada
  var evalLider = evsFiltradas.filter(function(e) { return e.tipo_evaluacion === 'evaluacion_lider' && e.rating_calibrado; });
  var bajo = 0; var medio = 0; var alto = 0;
  evalLider.forEach(function(e) {
    var r = parseFloat(e.rating_calibrado);
    if (r < 3) bajo++; else if (r <= 3.5) medio++; else alto++;
  });
  var totalG1 = bajo + medio + alto;

  // OBJETIVOS — filtrar por año, área y colaborador
  var areas = ['Todas'].concat([...new Set(colabs.map(function(c) { return c.area; }).filter(Boolean))].sort());
  var anios = [...new Set(objetivosData.map(function(o) { return o.anio; }).filter(Boolean))].sort(function(a,b) { return b - a; });
  if (!anios.includes(anioFiltro)) anios.unshift(anioFiltro);

  var colabsFiltradosObj = colabs.filter(function(c) {
    if (filtroAreaObj !== 'Todas' && c.area !== filtroAreaObj) return false;
    if (filtroColabObj !== 'Todos' && c.id !== filtroColabObj) return false;
    return true;
  });
  var idsColabsObj = colabsFiltradosObj.map(function(c) { return c.id; });

  var objsFiltrados = objetivosData.filter(function(o) {
    if (String(o.anio) !== String(anioFiltro)) return false;
    if (!idsColabsObj.includes(o.colaborador_id)) return false;
    return true;
  });

  // Gráfico 1 objetivos: Alcance promedio por área
  var alcancePorArea = {};
  objsFiltrados.forEach(function(o) {
    var colab = colabs.find(function(c) { return c.id === o.colaborador_id; });
    var area = colab?.area || 'Sin área';
    var alcance = parseFloat(o.alcance_validado || o.alcance_completado || 0);
    if (!alcancePorArea[area]) alcancePorArea[area] = { sum: 0, count: 0 };
    if (alcance > 0) { alcancePorArea[area].sum += alcance; alcancePorArea[area].count++; }
  });
  var alcanceAreaData = Object.entries(alcancePorArea)
    .filter(function(e) { return e[1].count > 0; })
    .map(function(e) { return { area: e[0], prom: (e[1].sum / e[1].count).toFixed(1) }; })
    .sort(function(a,b) { return parseFloat(b.prom) - parseFloat(a.prom); });

  // Gráfico 2 objetivos: Ranking alcance anual por colaborador
  var alcancePorColab = {};
  objsFiltrados.forEach(function(o) {
    var colab = colabs.find(function(c) { return c.id === o.colaborador_id; });
    if (!colab) return;
    var nombre = colab.full_name || colab.email;
    var alcance = parseFloat(o.alcance_validado || o.alcance_completado || 0);
    if (!alcancePorColab[nombre]) alcancePorColab[nombre] = { sum: 0, count: 0, area: colab.area };
    if (alcance > 0) { alcancePorColab[nombre].sum += alcance; alcancePorColab[nombre].count++; }
  });
  var rankingData = Object.entries(alcancePorColab)
    .filter(function(e) { return e[1].count > 0; })
    .map(function(e) { return { nombre: e[0], prom: (e[1].sum / e[1].count).toFixed(1), area: e[1].area }; })
    .sort(function(a,b) { return parseFloat(b.prom) - parseFloat(a.prom); });

  var AREA_COLORS = ['#2d6a4f','#c2410c','#1d4ed8','#7c3aed','#0e7490','#92400e','#064e3b','#be123c'];
  function areaColor(area) {
    var idx = Math.abs((area||'').split('').reduce(function(a,c) { return a + c.charCodeAt(0); }, 0)) % AREA_COLORS.length;
    return AREA_COLORS[idx];
  }

  var selectStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', color: '#231F20', cursor: 'pointer', fontWeight: 500 };

  // Spider chart inline
  function SpiderMini({ datos }) {
    if (!datos || datos.length === 0) return <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 12 }}>Sin datos</p>;
    var N = datos.length; var CX = 350; var CY = 350; var R = 160;
    function pt(idx, val) { var a = (Math.PI * 2 * idx / N) - Math.PI / 2; var r = (val / 5) * R; return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; }
    function pte(idx, r) { var a = (Math.PI * 2 * idx / N) - Math.PI / 2; return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; }
    var poly = datos.map(function(d, i) { var p = pt(i, d.prom); return p.x + ',' + p.y; }).join(' ');
    return (
      <svg viewBox="0 0 700 700" style={{ width: "100%", maxWidth: 560 }}>
        {[1,2,3,4,5].map(function(n) { return <polygon key={n} points={datos.map(function(_,i) { var p = pte(i,(n/5)*R); return p.x+','+p.y; }).join(' ')} fill="none" stroke={n===5?'#D4D2C6':'#e8e6e0'} strokeWidth={n===5?1.5:1} />; })}
        {datos.map(function(_,i) { var p = pte(i,R); return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="#e8e6e0" strokeWidth="1" />; })}
        <polygon points={poly} fill="rgba(35,31,32,0.12)" stroke="#231F20" strokeWidth="2" />
        {datos.map(function(d,i) { var p = pt(i,d.prom); return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#231F20" />; })}
        {datos.map(function(d,i) {
          var p = pte(i,R+90); var anchor = p.x < CX-10 ? 'end' : p.x > CX+10 ? 'start' : 'middle';
          var words = d.nombre.split(' '); var lines = [];
          for (var w=0;w<words.length;w+=1) lines.push(words[w]);
          return <g key={i}>{lines.map(function(l,li) { return <text key={li} x={p.x} y={p.y-lines.length*9+li*17} fontSize="13" fill="#231F20" fontWeight="600" textAnchor={anchor}>{l}</text>; })}<text x={p.x} y={p.y+lines.length*9+8} fontSize="14" fill="#64748b" fontWeight="700" textAnchor={anchor}>{d.prom.toFixed(1)}</text></g>;
        })}
      </svg>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button onClick={function() { setTabActivo('desempeno'); }} style={tabActivo === 'desempeno' ? s.btnPrimario : s.btnInfo}>Desempeño</button>
        <button onClick={function() { setTabActivo('objetivos'); }} style={tabActivo === 'objetivos' ? s.btnPrimario : s.btnInfo}>Objetivos</button>
      </div>

      {/* ===== SECCIÓN DESEMPEÑO ===== */}
      {tabActivo === 'desempeno' && (
        <div>
          <h2 style={{ color: '#231F20', margin: '0 0 20px 0', fontSize: 20, fontWeight: 700 }}>Desempeño — Vista general</h2>
          {/* Filtros desempeño */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center", background: "white", padding: "12px 16px", borderRadius: 10, border: "1px solid #e8e6e0" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Filtrar:</span>
            <select value={filtroAreaDesemp} onChange={function(e) { setFiltroAreaDesemp(e.target.value); setFiltroColabDesemp("Todos"); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e8e6e0", fontSize: 13, background: "white" }}>
              {areasDesemp.map(function(a) { return <option key={a} value={a}>{a === "Todas" ? "Todas las áreas" : a}</option>; })}
            </select>
            <select value={filtroSeniorityDesemp} onChange={function(e) { setFiltroSeniorityDesemp(e.target.value); setFiltroColabDesemp("Todos"); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e8e6e0", fontSize: 13, background: "white" }}>
              {senioritiesDesemp.map(function(s) { return <option key={s} value={s}>{s === "Todos" ? "Todos los seniority" : s}</option>; })}
            </select>
            <select value={filtroColabDesemp} onChange={function(e) { setFiltroColabDesemp(e.target.value); setFiltroAreaDesemp("Todas"); setFiltroSeniorityDesemp("Todos"); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e8e6e0", fontSize: 13, background: "white", minWidth: 180 }}>
              <option value="Todos">Todos los colaboradores</option>
              {colabs.sort(function(a,b) { return (a.full_name||"").localeCompare(b.full_name||""); }).map(function(c) { return <option key={c.id} value={c.id}>{c.full_name || c.email}</option>; })}
            </select>
            <select value={filtroCicloDesemp} onChange={function(e) { setFiltroCicloDesemp(e.target.value); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e8e6e0", fontSize: 13, background: "white" }}>
              {ciclosOpts.map(function(c) { return <option key={c.id} value={c.id}>{c.nombre}</option>; })}
            </select>
            {(filtroAreaDesemp !== "Todas" || filtroSeniorityDesemp !== "Todos" || filtroColabDesemp !== "Todos" || filtroCicloDesemp !== "Todos") && (
              <button onClick={function() { setFiltroAreaDesemp("Todas"); setFiltroSeniorityDesemp("Todos"); setFiltroColabDesemp("Todos"); setFiltroCicloDesemp("Todos"); }} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}>Limpiar</button>
            )}
          </div>
          <div style={s.grid}>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Evaluaciones lider</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{evalLider.length}</p></div>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Calibradas</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{totalG1}</p></div>
            <div style={{ ...s.tarjetaStat, borderTop: '3px solid #166534' }}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Alto desempeño</p><p style={{ fontSize: 32, fontWeight: 800, color: '#166534', margin: '6px 0' }}>{alto}</p></div>
            <div style={{ ...s.tarjetaStat, borderTop: '3px solid #64748b' }}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Desempeño esperado</p><p style={{ fontSize: 32, fontWeight: 800, color: '#64748b', margin: '6px 0' }}>{medio}</p></div>
            <div style={{ ...s.tarjetaStat, borderTop: '3px solid #dc2626' }}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Bajo desempeño</p><p style={{ fontSize: 32, fontWeight: 800, color: '#dc2626', margin: '6px 0' }}>{bajo}</p></div>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 20 }}>
            {/* Distribución */}
            <div style={{ ...s.tarjetaStat, flex: 1, minWidth: 260 }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#231F20', fontSize: 14, fontWeight: 700 }}>Distribución de Desempeño</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: 11, color: '#94a3b8' }}>Solo evaluaciones calibradas</p>
              {totalG1 === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>Sin datos calibrados</p> : (
                [{ label: 'Alto', valor: alto, color: '#166534', rango: '3.6–5' }, { label: 'Medio', valor: medio, color: '#92400e', rango: '3–3.5' }, { label: 'Bajo', valor: bajo, color: '#dc2626', rango: '1–2.9' }].map(function(g) {
                  var pct = Math.round(g.valor / totalG1 * 100);
                  return <div key={g.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600, color: g.color }}>{g.label} <span style={{ fontSize: 11, color: '#94a3b8' }}>({g.rango})</span></span><span style={{ fontSize: 13, fontWeight: 700 }}>{g.valor} ({pct}%)</span></div>
                    <div style={{ background: '#f1f5f9', borderRadius: 6, height: 22, overflow: 'hidden' }}><div style={{ background: g.color, height: '100%', width: pct + '%', borderRadius: 6 }} /></div>
                  </div>;
                })
              )}
            </div>
            {/* Araña */}
            <div style={{ ...s.tarjetaStat, flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h4 style={{ margin: '0 0 4px 0', color: '#231F20', fontSize: 14, fontWeight: 700, alignSelf: 'flex-start' }}>Promedio por Competencia</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: 11, color: '#94a3b8', alignSelf: 'flex-start' }}>Evaluaciones del líder calibradas</p>
              <SpiderMini datos={compData} />
            </div>
          </div>
        </div>
      )}

      {/* ===== SECCIÓN OBJETIVOS ===== */}
      {tabActivo === 'objetivos' && (
        <div>
          <h2 style={{ color: '#231F20', margin: '0 0 20px 0', fontSize: 20, fontWeight: 700 }}>Objetivos — Vista general</h2>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '14px 16px', borderRadius: 10, border: '1px solid #e8e6e0' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Filtrar:</span>
            <select value={anioFiltro} onChange={function(e) { setAnioFiltro(parseInt(e.target.value)); }} style={selectStyle}>
              {anios.map(function(a) { return <option key={a} value={a}>{a}</option>; })}
            </select>
            <select value={filtroAreaObj} onChange={function(e) { setFiltroAreaObj(e.target.value); setFiltroColabObj('Todos'); }} style={selectStyle}>
              {areas.map(function(a) { return <option key={a} value={a}>{a === 'Todas' ? 'Todas las áreas' : a}</option>; })}
            </select>
            <select value={filtroColabObj} onChange={function(e) { setFiltroColabObj(e.target.value); setFiltroAreaObj('Todas'); }} style={{ ...selectStyle, minWidth: 180 }}>
              <option value="Todos">Todos los colaboradores</option>
              {colabs.sort(function(a,b) { return (a.full_name||'').localeCompare(b.full_name||''); }).map(function(c) { return <option key={c.id} value={c.id}>{c.full_name || c.email}</option>; })}
            </select>
            {(filtroAreaObj !== 'Todas' || filtroColabObj !== 'Todos') && (
              <button onClick={function() { setFiltroAreaObj('Todas'); setFiltroColabObj('Todos'); }} style={{ fontSize: 12, padding: '7px 12px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Limpiar</button>
            )}
          </div>

          {/* KPI Objetivos */}
          <div style={{ ...s.grid, marginBottom: 24 }}>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Objetivos {anioFiltro}</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{objsFiltrados.length}</p></div>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Validados</p><p style={{ fontSize: 32, fontWeight: 800, color: '#166534', margin: '6px 0' }}>{objsFiltrados.filter(function(o) { return o.status === 'validado'; }).length}</p></div>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Con alcance</p><p style={{ fontSize: 32, fontWeight: 800, color: '#1d4ed8', margin: '6px 0' }}>{objsFiltrados.filter(function(o) { return o.alcance_completado || o.alcance_validado; }).length}</p></div>
            <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Alcance promedio</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{rankingData.length > 0 ? (rankingData.reduce(function(s,r) { return s + parseFloat(r.prom); }, 0) / rankingData.length).toFixed(1) + '%' : '—'}</p></div>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {/* Gráfico 1: Alcance promedio por área */}
            <div style={{ ...s.tarjetaStat, flex: 1, minWidth: 280 }}>
              <h4 style={{ margin: '0 0 16px 0', color: '#231F20', fontSize: 14, fontWeight: 700 }}>Alcance promedio por área</h4>
              {alcanceAreaData.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>Sin alcances registrados</p> : (
                alcanceAreaData.map(function(d) {
                  var color = areaColor(d.area);
                  var pct = Math.min(parseFloat(d.prom), 120);
                  return <div key={d.area} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#231F20' }}>{d.area}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: color }}>{d.prom}%</span>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                      <div style={{ background: color, height: '100%', width: (pct / 120 * 100) + '%', borderRadius: 6 }} />
                    </div>
                  </div>;
                })
              )}
            </div>

            {/* Gráfico 2: Ranking alcance anual por colaborador */}
            <div style={{ ...s.tarjetaStat, flex: 2, minWidth: 320 }}>
              <h4 style={{ margin: '0 0 4px 0', color: '#231F20', fontSize: 14, fontWeight: 700 }}>Ranking — Alcance anual por colaborador</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: 11, color: '#94a3b8' }}>Promedio de alcances reportados/validados</p>
              {rankingData.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>Sin alcances registrados para {anioFiltro}</p> : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {rankingData.map(function(d, idx) {
                    var color = areaColor(d.area);
                    var pct = Math.min(parseFloat(d.prom), 120);
                    var medal = idx === 0 ? '1' : idx === 1 ? '2' : idx === 2 ? '3' : String(idx + 1);
                    return <div key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: idx < 3 ? color : '#94a3b8', minWidth: 24, textAlign: 'center' }}>#{medal}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, color: '#231F20', fontWeight: 500 }}>{d.nombre}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: color, fontWeight: 600, padding: '1px 6px', background: color + '20', borderRadius: 4 }}>{d.area}</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: parseFloat(d.prom) >= 100 ? '#166534' : parseFloat(d.prom) >= 80 ? '#92400e' : '#dc2626' }}>{d.prom}%</span>
                          </div>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                          <div style={{ background: parseFloat(d.prom) >= 100 ? '#166534' : parseFloat(d.prom) >= 80 ? '#f59e0b' : '#dc2626', height: '100%', width: (pct / 120 * 100) + '%', borderRadius: 6, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    </div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// DASHBOARD Y TABLAS ADMIN
// =============================================
function DashboardView({ stats, colabs }) {
 var [filtroArea, setFiltroArea] = useState('Todas');
 var [filtroSeniority, setFiltroSeniority] = useState('Todos');
 var [filtroColaborador, setFiltroColaborador] = useState('Todos');
 var [filtroCiclo, setFiltroCiclo] = useState('Todos');
 var [ciclos, setCiclos] = useState([]);

 var evaluaciones = stats.evaluaciones || [];
 var puntuaciones = stats.puntuaciones || [];
 var perfiles = stats.perfiles || colabs;

 useEffect(function() {
 supabase.from('ciclos').select('id, nombre').order('fecha_inicio', { ascending: false }).then(function(res) { setCiclos(res.data || []); });
 }, []);

 // Opciones de filtro
 var areas = ['Todas'].concat([...new Set(perfiles.map(function(p) { return p.area; }).filter(Boolean))].sort());
 var seniorities = ['Todos'].concat([...new Set(perfiles.map(function(p) { return p.seniority; }).filter(Boolean))].sort());
 var colaboradores = ['Todos'].concat(perfiles.map(function(p) { return { id: p.id, nombre: p.full_name || p.email }; }));

 // Perfiles filtrados
 var perfilesFiltrados = perfiles.filter(function(p) {
 if (filtroArea !== 'Todas' && p.area !== filtroArea) return false;
 if (filtroSeniority !== 'Todos' && p.seniority !== filtroSeniority) return false;
 if (filtroColaborador !== 'Todos' && p.id !== filtroColaborador) return false;
 return true;
 });
 var idsFiltrados = perfilesFiltrados.map(function(p) { return p.id; });

 // Evaluaciones filtradas por ciclo y perfil
 var evalFiltradas = evaluaciones.filter(function(e) {
 if (!idsFiltrados.includes(e.colaborador_id)) return false;
 if (filtroCiclo !== 'Todos' && String(e.ciclo_id) !== String(filtroCiclo)) return false;
 return true;
 });

 // Gráfico 1: Distribución Bajo/Medio/Alto
 var evalLider = evalFiltradas.filter(function(e) { return e.tipo_evaluacion === "evaluacion_lider" && e.rating_calibrado; });
 var bajo = 0; var medio = 0; var alto = 0;
 evalLider.forEach(function(e) {
 var r = parseFloat(e.rating_calibrado || e.rating_promedio);
 if (r < 3) bajo++; else if (r <= 3.5) medio++; else alto++;
 });
 var totalG1 = bajo + medio + alto;
 var grupos = [
 { label: 'Alto', valor: alto, color: '#166534', rango: '3.6 – 5.0' },
 { label: 'Medio', valor: medio, color: '#92400e', rango: '3.0 – 3.5' },
 { label: 'Bajo', valor: bajo, color: '#dc2626', rango: '1.0 – 2.9' },
 ];

 // Gráfico 2: Promedio por competencia (para araña)
  var evalIdsFiltrados = evalFiltradas.filter(function(e) { return e.tipo_evaluacion === "evaluacion_lider" && e.rating_calibrado; }).map(function(e) { return e.id; });
 var compMap = {};
 puntuaciones.forEach(function(p) {
 if (!evalIdsFiltrados.includes(p.evaluacion_id)) return;
 var nombre = p.competencias && p.competencias.nombre;
 if (!nombre || !p.rating) return;
 if (!compMap[nombre]) compMap[nombre] = { sum: 0, count: 0 };
 compMap[nombre].sum += parseFloat(p.rating);
 compMap[nombre].count++;
 });
 var compData = Object.entries(compMap).map(function(e) {
 return { nombre: e[0], prom: e[1].sum / e[1].count };
 }).sort(function(a, b) { return b.prom - a.prom; });

 // Colores filtro
 var selectStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', color: '#231F20', cursor: 'pointer', fontWeight: 500 };

 // Gráfico de araña SVG
 function SpiderChart({ datos }) {
 if (!datos || datos.length === 0) return <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>Sin puntuaciones cargadas aún</p>;

 var N = datos.length;
 var CX = 300; var CY = 280; var R = 150;
 var niveles = [1, 2, 3, 4, 5];

 function punto(idx, valor) {
 var angulo = (Math.PI * 2 * idx / N) - Math.PI / 2;
 var r = (valor / 5) * R;
 return { x: CX + r * Math.cos(angulo), y: CY + r * Math.sin(angulo) };
 }

 function puntoEje(idx, r) {
 var angulo = (Math.PI * 2 * idx / N) - Math.PI / 2;
 return { x: CX + r * Math.cos(angulo), y: CY + r * Math.sin(angulo) };
 }

 var poligono = datos.map(function(d, i) { var p = punto(i, d.prom); return p.x + ',' + p.y; }).join(' ');

 return (
 <svg viewBox="0 0 600 540" style={{ width: "100%", maxWidth: 600 }}>
 {/* Ejes de fondo por nivel */}
 {niveles.map(function(niv) {
 var puntos = datos.map(function(_, i) { var p = puntoEje(i, (niv / 5) * R); return p.x + ',' + p.y; }).join(' ');
 return <polygon key={niv} points={puntos} fill="none" stroke={niv === 5 ? '#D4D2C6' : '#e8e6e0'} strokeWidth={niv === 5 ? 1.5 : 1} />;
 })}
 {/* Líneas desde el centro */}
 {datos.map(function(_, i) {
 var p = puntoEje(i, R);
 return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="#e8e6e0" strokeWidth="1" />;
 })}
 {/* Polígono de datos */}
 <polygon points={poligono} fill="rgba(35,31,32,0.12)" stroke="#231F20" strokeWidth="2" />
 {/* Puntos */}
 {datos.map(function(d, i) {
 var p = punto(i, d.prom);
 return (
 <g key={i}>
 <circle cx={p.x} cy={p.y} r="5" fill="#231F20" />
 <title>{d.nombre}: {d.prom.toFixed(1)}</title>
 </g>
 );
 })}
 {/* Labels de competencias */}
 {datos.map(function(d, i) {
 var p = puntoEje(i, R + 70);
 var anchor = p.x < CX - 10 ? 'end' : p.x > CX + 10 ? 'start' : 'middle';
 // Dividir nombre en máx 2 palabras por línea
 var palabras = d.nombre.split(' ');
 var lineas = [];
 for (var w = 0; w < palabras.length; w += 2) {
 lineas.push(palabras.slice(w, w + 2).join(' '));
 }
 var lineH = 16;
 var totalH = lineas.length * lineH;
 return (
 <g key={i}>
 {lineas.map(function(lin, li) {
 return <text key={li} x={p.x} y={p.y - totalH / 2 + li * lineH + lineH / 2} fontSize="13" fill="#231F20" fontWeight="700" textAnchor={anchor}>{lin}</text>;
 })}
 <text x={p.x} y={p.y + totalH / 2 + 14} fontSize="13" fill="#64748b" fontWeight="800" textAnchor={anchor}>{d.prom.toFixed(1)}</text>
 </g>
 );
 })}
 {/* Valores de escala */}
 {niveles.map(function(niv) {
 return <text key={niv} x={CX + 5} y={CY - (niv / 5) * R + 4} fontSize="10" fill="#94a3b8">{niv}</text>;
 })}
 </svg>
 );
 }

 return (
 <div>
 {/* KPI Cards */}
 <div style={s.grid}>
 <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Participantes</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{perfilesFiltrados.length}</p></div>
 <div style={s.tarjetaStat}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Evaluaciones</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{evalFiltradas.filter(function(e) { return e.tipo_evaluacion === "evaluacion_lider"; }).length}</p></div>
 <div style={{ ...s.tarjetaStat, borderTop: '3px solid #231F20' }}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Completadas</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{evalFiltradas.filter(function(e) { return e.tipo_evaluacion === "evaluacion_lider" && e.estado === 'enviado' }).length}</p></div>
 <div style={{ ...s.tarjetaStat, borderTop: '3px solid #D4D2C6' }}><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Pendientes</p><p style={{ fontSize: 32, fontWeight: 800, color: '#231F20', margin: '6px 0' }}>{evalFiltradas.filter(function(e) { return e.tipo_evaluacion === "evaluacion_lider" && e.estado !== 'enviado' }).length}</p></div>
 </div>

 {/* Filtros */}
 <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center', background: 'white', padding: '14px 16px', borderRadius: 10, border: '1px solid #e8e6e0' }}>
 <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtrar:</span>
 <select value={filtroArea} onChange={function(e) { setFiltroArea(e.target.value); setFiltroColaborador('Todos'); }} style={selectStyle}>
 {areas.map(function(a) { return <option key={a} value={a}>{a === 'Todas' ? 'Todas las áreas' : a}</option>; })}
 </select>
 <select value={filtroSeniority} onChange={function(e) { setFiltroSeniority(e.target.value); setFiltroColaborador('Todos'); }} style={selectStyle}>
 {seniorities.map(function(s) { return <option key={s} value={s}>{s === 'Todos' ? 'Todos los seniority' : s}</option>; })}
 </select>
 <select value={filtroColaborador} onChange={function(e) { setFiltroColaborador(e.target.value); setFiltroArea('Todas'); setFiltroSeniority('Todos'); }} style={{ ...selectStyle, minWidth: 180 }}>
 <option value="Todos">Todos los colaboradores</option>
 {perfiles.sort(function(a,b) { return (a.full_name||'').localeCompare(b.full_name||''); }).map(function(p) { return <option key={p.id} value={p.id}>{p.full_name || p.email}</option>; })}
 </select>
 <select value={filtroCiclo} onChange={function(e) { setFiltroCiclo(e.target.value); }} style={selectStyle}>
 <option value="Todos">Todos los ciclos</option>
 {ciclos.map(function(c) { return <option key={c.id} value={c.id}>{c.nombre}</option>; })}
 </select>
 {(filtroArea !== 'Todas' || filtroSeniority !== 'Todos' || filtroColaborador !== 'Todos' || filtroCiclo !== 'Todos') && (
 <button onClick={function() { setFiltroArea('Todas'); setFiltroSeniority('Todos'); setFiltroColaborador('Todos'); setFiltroCiclo('Todos'); }}
 style={{ fontSize: 12, padding: '7px 12px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
 Limpiar filtros
 </button>
 )}
 </div>

 {/* Gráficos */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>

 {/* Gráfico 1 — Distribución */}
 <div style={{ ...s.tarjetaStat, flex: 1, minWidth: 260 }}>
 <h4 style={{ margin: '0 0 6px 0', color: '#231F20', fontSize: 14, fontWeight: 700 }}>Distribución de Desempeño</h4>
 <p style={{ margin: '0 0 16px 0', fontSize: 11, color: '#94a3b8' }}>Bajo: 1–2.9 | Medio: 3–3.5 | Alto: 3.6–5</p>
 {totalG1 === 0 ? (
 <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>Sin evaluaciones calibradas aún</p>
 ) : grupos.map(function(g) {
 var pct = Math.round(g.valor / totalG1 * 100);
 return (
 <div key={g.label} style={{ marginBottom: 14 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
 <span style={{ fontSize: 13, fontWeight: 600, color: g.color }}>{g.label} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>({g.rango})</span></span>
 <span style={{ fontSize: 13, fontWeight: 700, color: '#231F20' }}>{g.valor} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({pct}%)</span></span>
 </div>
 <div style={{ background: '#f1f5f9', borderRadius: 6, height: 22, overflow: 'hidden' }}>
 <div style={{ background: g.color, height: '100%', width: pct + '%', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, boxSizing: 'border-box' }}>
 {pct > 15 && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>{pct}%</span>}
 </div>
 </div>
 </div>
 );
 })}
 {totalG1 > 0 && <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>Total: {totalG1} colaboradores</p>}
 </div>

 {/* Gráfico 2 — Araña de competencias */}
 <div style={{ ...s.tarjetaStat, flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
 <h4 style={{ margin: '0 0 4px 0', color: '#231F20', fontSize: 14, fontWeight: 700, alignSelf: 'flex-start' }}>
 Promedio por Competencia
 {filtroColaborador !== 'Todos' && (
 <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
 — {(perfiles.find(function(p) { return p.id === filtroColaborador; }) || {}).full_name || ''}
 </span>
 )}
 </h4>
 <p style={{ margin: '0 0 16px 0', fontSize: 11, color: '#94a3b8', alignSelf: 'flex-start' }}>
 {filtroColaborador !== 'Todos' ? 'Vista individual del colaborador' : 'Promedio general — solo evaluaciones calibradas'}
 </p>
 <SpiderChart datos={compData} />
 {compData.length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 8 }}>
 {compData.map(function(c) {
 var cls = clasificarRating(c.prom);
 return (
 <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f0ec' }}>
 <span style={{ fontSize: 12, color: '#475569' }}>{c.nombre}</span>
 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
 {cls && <span style={{ fontSize: 10, color: cls.color, fontWeight: 600 }}>{cls.label}</span>}
 <span style={{ fontSize: 14, fontWeight: 800, color: '#231F20', minWidth: 28, textAlign: 'right' }}>{c.prom.toFixed(1)}</span>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 </div>
 );
}

function ParticipantesView({ colabs }) {
 return (
 <div style={s.tarjetaStat}>
 <h4>Participantes ({colabs.length})</h4>
 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
 <thead><tr><th style={th}>Nombre</th><th style={th}>Email</th><th style={th}>Area</th><th style={th}>Seniority</th></tr></thead>
 <tbody>{colabs.map(function(c) { return (<tr key={c.id}><td style={td}>{c.full_name || '-'}</td><td style={td}>{c.email}</td><td style={td}>{c.area || '-'}</td><td style={td}>{c.seniority || '-'}</td></tr>); })}</tbody>
 </table>
 </div>
 );
}

function EvaluacionesAdmin({ cicloId }) {
 var [evs, setEvs] = useState([]); var [carg, setCarg] = useState(true);
 var [filtroTipo, setFiltroTipo] = useState('Todos');
 var [filtroEstado, setFiltroEstado] = useState('Todos');
 useEffect(function() { (async function() { var { data } = await supabase.from('evaluaciones').select('id,colaborador_id,tipo_evaluacion,estado,rating_promedio,rating_calibrado,created_at,colaborador:colaborador_id(email,full_name)').eq('ciclo_id', cicloId).order('created_at', { ascending: false }); setEvs(data || []); setCarg(false); })(); }, [cicloId]);
 if (carg) return <p>Cargando...</p>;
 var evsFiltradas = evs.filter(function(ev) {
   if (filtroTipo === 'Auto' && ev.tipo_evaluacion !== 'autoevaluacion') return false;
   if (filtroTipo === 'Lider' && ev.tipo_evaluacion !== 'evaluacion_lider') return false;
   if (filtroEstado !== 'Todos' && ev.estado !== filtroEstado) return false;
   return true;
 });
 var selectStyle = { padding: '7px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', cursor: 'pointer' };
 return (
 <div style={s.tarjetaStat}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
   <h4 style={{ margin: 0 }}>Ver Evaluaciones ({evsFiltradas.length} de {evs.length})</h4>
   <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
     <select value={filtroTipo} onChange={function(e) { setFiltroTipo(e.target.value); }} style={selectStyle}>
       <option value="Todos">Todos los tipos</option>
       <option value="Auto">Autoevaluación</option>
       <option value="Lider">Evaluación Líder</option>
     </select>
     <select value={filtroEstado} onChange={function(e) { setFiltroEstado(e.target.value); }} style={selectStyle}>
       <option value="Todos">Todos los estados</option>
       <option value="enviado">Enviado</option>
       <option value="borrador">Borrador</option>
     </select>
     {(filtroTipo !== 'Todos' || filtroEstado !== 'Todos') && (
       <button onClick={function() { setFiltroTipo('Todos'); setFiltroEstado('Todos'); }} style={{ ...s.btnInfo, color: '#dc2626', borderColor: '#fca5a5', fontSize: 12 }}>Limpiar</button>
     )}
   </div>
 </div>
 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
 <thead><tr><th style={th}>Colaborador</th><th style={th}>Tipo</th><th style={th}>Estado</th><th style={th}>Rating</th><th style={th}>Calibrado</th><th style={th}>Fecha</th></tr></thead>
 <tbody>{evsFiltradas.map(function(ev) {
   var esLider = ev.tipo_evaluacion === 'evaluacion_lider';
   var esBorrador = ev.estado === 'borrador';
   return (
     <tr key={ev.id} style={{ borderBottom: '1px solid #f1f5f9', background: esBorrador ? '#fffbeb' : 'white' }}>
       <td style={td}>{ev.colaborador?.full_name || '-'}</td>
       <td style={td}>
         <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: esLider ? '#dbeafe' : '#F0EDE8', color: esLider ? '#1e40af' : '#231F20' }}>
           {esLider ? 'Líder' : 'Auto'}
         </span>
       </td>
       <td style={td}>
         <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: esBorrador ? '#fef3c7' : '#dcfce7', color: esBorrador ? '#92400e' : '#166534' }}>
           {ev.estado}
         </span>
       </td>
       <td style={{ ...td, fontWeight: 700 }}>{ev.rating_promedio || '-'}</td>
       <td style={td}>{ev.rating_calibrado || '-'}</td>
       <td style={td}>{new Date(ev.created_at).toLocaleDateString('es-AR')}</td>
     </tr>
   );
 })}</tbody>
 </table>
 </div>
 );
}

function PanelCalibracion({ cicloId, colabs, onHist, soloLectura }) {
  var [datos, setDatos] = useState([]); var [carg, setCarg] = useState(true); var [filtro, setFiltro] = useState("Todas"); var [editandoCal, setEditandoCal] = useState(null); var [calTemp, setCalTemp] = useState({ rating: "", comentario: "" });
  var [historial, setHistorial] = useState([]);
  var [historialError, setHistorialError] = useState(null);
  var [showHistorial, setShowHistorial] = useState(false);
  var [nuevoComentario, setNuevoComentario] = useState("");
  var [colaboradorHist, setColaboradorHist] = useState(null);
  // Selección múltiple para exportación masiva
  var [seleccionados, setSeleccionados] = useState([]);
  var [exportando, setExportando] = useState(false);
  // Modal de reapertura (reemplaza window.prompt/confirm — más confiable y deja motivo obligatorio)
  var [reabriendo, setReabriendo] = useState(null); // { evalId, tipo, colaboradorId, colaboradorNombre }
  var [motivoReapertura, setMotivoReapertura] = useState("");
 useEffect(function() { cargar(); }, [cicloId]);
 async function cargar() {
 setCarg(true);
 var [{ data: evs }, { data: historial }] = await Promise.all([
   supabase.from('evaluaciones').select('id, colaborador_id, tipo_evaluacion, evaluador_id, estado, rating_promedio, rating_calibrado, comentario_calibracion, puntuaciones(rating, competencia_id, comentario, competencias(nombre)), colaborador:colaborador_id(id, email, full_name, area, seniority, puesto)').eq('ciclo_id', cicloId).in('tipo_evaluacion', ['autoevaluacion', 'evaluacion_lider']),
   supabase.from('calibracion_historial').select('colaborador_id, tipo').eq('ciclo_id', cicloId).in('tipo', ['reabrir_lider', 'comentario', 'calibracion'])
 ]);
 // Set de colaboradores con reapertura de lider
 var reabiertos = new Set((historial || []).map(function(h) { return h.colaborador_id; }));
 var mapa = {};
 (evs || []).forEach(function(ev) {
 if (!ev.colaborador) return;
 if (!mapa[ev.colaborador_id]) mapa[ev.colaborador_id] = { colaborador: ev.colaborador, autoevaluacion: null, evaluacionLider: null, ratingFinal: null, comentarioCalibracion: null, promAuto: null, promLider: null, liderReabierto: false };
 if (ev.tipo_evaluacion === 'autoevaluacion') { mapa[ev.colaborador_id].autoevaluacion = ev; mapa[ev.colaborador_id].promAuto = ev.rating_promedio; }
 if (ev.tipo_evaluacion === 'evaluacion_lider') {
 mapa[ev.colaborador_id].evaluacionLider = ev;
 mapa[ev.colaborador_id].promLider = ev.rating_promedio;
 mapa[ev.colaborador_id].comentarioCalibracion = ev.comentario_calibracion || null;
 mapa[ev.colaborador_id].liderReabierto = reabiertos.has(ev.colaborador_id);
  mapa[ev.colaborador_id].ratingFinal = ev.rating_calibrado || null;
 }
 });
 setDatos(Object.values(mapa)); setCarg(false);
 }


 async function guardarCal(evaluacionId, rating, comentario, ratingLider) {
   var rCal = parseFloat(rating) || 0; var rLid = parseFloat(ratingLider) || 0;
   if (rCal !== rLid && !comentario.trim()) { alert('Debes justificar por que el rating calibrado difiere del rating del lider.'); return; }
   await supabase.from('evaluaciones').update({ rating_calibrado: rating, comentario_calibracion: comentario }).eq('id', evaluacionId);
   setDatos(function(p) { return p.map(function(d) { return d.evaluacionLider?.id === evaluacionId ? { ...d, ratingFinal: rating, comentarioCalibracion: comentario } : d; }); });
 }

 // Abre el modal para pedir el motivo de reapertura (reemplaza window.confirm + window.prompt)
 function iniciarReapertura(evalId, tipo, colaboradorId, colaboradorNombre) {
   setReabriendo({ evalId: evalId, tipo: tipo, colaboradorId: colaboradorId, colaboradorNombre: colaboradorNombre });
   setMotivoReapertura("");
 }

 async function confirmarReapertura() {
   if (!reabriendo) return;
   if (!motivoReapertura.trim()) { alert('El motivo de reapertura es obligatorio.'); return; }
   var { evalId, tipo, colaboradorId } = reabriendo;
   try {
     var { error: updErr } = await supabase.from('evaluaciones').update({ estado: 'borrador' }).eq('id', evalId);
     if (updErr) { alert('No se pudo reabrir la evaluación: ' + updErr.message); return; }
     var { data: { session } } = await supabase.auth.getSession();
     var tipoHist = tipo.includes('auto') ? 'reabrir_auto' : 'reabrir_lider';
     var { error: histErr } = await supabase.from('calibracion_historial').insert({
       ciclo_id: cicloId, colaborador_id: colaboradorId, evaluacion_id: evalId,
       tipo: tipoHist,
       comentario: 'Reapertura de ' + tipo + ': ' + motivoReapertura.trim(),
       usuario_id: session?.user?.id || null,
       usuario_nombre: session?.user?.email || 'Desconocido'
     });
     if (histErr) { console.error('Error guardando historial de reapertura:', histErr); alert('La evaluación se reabrió, pero no se pudo guardar el motivo en el historial: ' + histErr.message); }
     setReabriendo(null);
     setMotivoReapertura("");
     cargar();
     // Abrir/actualizar el historial de este colaborador para que se vea el registro al instante
     cargarHistorial(colaboradorId);
   } catch (e) {
     console.error('Error inesperado al reabrir evaluación:', e);
     alert('Ocurrió un error inesperado al reabrir la evaluación. Revisá la consola para más detalle.');
   }
 }

 async function cargarHistorial(colaboradorId) {
   setHistorialError(null);
   var { data, error } = await supabase.from('calibracion_historial')
     .select('*').eq('ciclo_id', cicloId).eq('colaborador_id', colaboradorId)
     .order('created_at', { ascending: false });
   if (error) {
     console.error('Error cargando historial de calibración:', error);
     setHistorialError(error.message || 'No se pudo cargar el historial.');
     setHistorial([]);
   } else {
     setHistorial(data || []);
   }
   setColaboradorHist(colaboradorId);
   setShowHistorial(true);
 }

 async function agregarComentario(colaboradorId) {
   if (!nuevoComentario.trim()) return;
   var { data: { session } } = await supabase.auth.getSession();
   var { error } = await supabase.from('calibracion_historial').insert({
     ciclo_id: cicloId, colaborador_id: colaboradorId,
     tipo: 'comentario',
     comentario: nuevoComentario,
     usuario_id: session?.user?.id || null,
     usuario_nombre: session?.user?.email || 'Desconocido'
   });
   if (error) { console.error('Error guardando comentario de historial:', error); alert('No se pudo guardar el comentario: ' + error.message); return; }
   setNuevoComentario('');
   cargarHistorial(colaboradorId);
 }

 // Carga fresca de datos de auto/lider + competencias — reutilizada por PDF y por Excel
 async function obtenerDatosEvaluacionCompleta(d) {
 var autoPunts = {}, autoComs = {}, liderPunts = {}, liderComs = {}, compsOrden = [];
 var autoComentFin = '', liderComentFin = '';
 var promAuto = d.promAuto || null;
 var promLider = d.promLider || null;

 if (d.autoevaluacion?.id) {
 var { data: aev } = await supabase
 .from('evaluaciones')
 .select('comentarios_finales, rating_promedio')
 .eq('id', d.autoevaluacion.id)
 .single();
 autoComentFin = aev?.comentarios_finales || '';
 if (!promAuto) promAuto = aev?.rating_promedio || null;

 var { data: ap } = await supabase
 .from('puntuaciones')
 .select('rating, competencia_id, comentario')
 .eq('evaluacion_id', d.autoevaluacion.id);
 (ap || []).forEach(function(p) {
 autoPunts[p.competencia_id] = p.rating;
 autoComs[p.competencia_id] = p.comentario || '';
 });
 }

 if (d.evaluacionLider?.id) {
 var { data: lev } = await supabase
 .from('evaluaciones')
 .select('comentarios_finales, rating_promedio')
 .eq('id', d.evaluacionLider.id)
 .single();
 liderComentFin = lev?.comentarios_finales || '';
 if (!promLider) promLider = lev?.rating_promedio || null;

 var { data: lp } = await supabase
 .from('puntuaciones')
 .select('rating, competencia_id, comentario')
 .eq('evaluacion_id', d.evaluacionLider.id);
 (lp || []).forEach(function(p) {
 liderPunts[p.competencia_id] = p.rating;
 liderComs[p.competencia_id] = p.comentario || '';
 });
 }

 var todasIds = [...new Set([...Object.keys(autoPunts), ...Object.keys(liderPunts)])];
 if (todasIds.length > 0) {
 var { data: compsData } = await supabase
 .from('competencias')
 .select('id, nombre')
 .in('id', todasIds);
 (compsData || []).forEach(function(c) {
 compsOrden.push({ id: c.id, nombre: c.nombre });
 });
 }

 if (compsOrden.length === 0) {
 var sen = d.colaborador?.seniority || 'Analista';
 var { data: cFB } = await supabase.from('competencias').select('id, nombre').eq('aplica_a', sen);
 if (!cFB || cFB.length === 0) {
 var { data: cAll } = await supabase.from('competencias').select('id, nombre');
 cFB = cAll || [];
 }
 compsOrden = (cFB || []).map(function(c) { return { id: c.id, nombre: c.nombre }; });
 }

 return { autoPunts, autoComs, liderPunts, liderComs, compsOrden, autoComentFin, liderComentFin, promAuto, promLider };
 }

 async function generarPDFCompleto(d) {
 var datosFrescos = await obtenerDatosEvaluacionCompleta(d);
 var autoPunts = datosFrescos.autoPunts, autoComs = datosFrescos.autoComs;
 var liderPunts = datosFrescos.liderPunts, liderComs = datosFrescos.liderComs;
 var compsOrden = datosFrescos.compsOrden;
 var autoComentFin = datosFrescos.autoComentFin, liderComentFin = datosFrescos.liderComentFin;
 var promAuto = datosFrescos.promAuto, promLider = datosFrescos.promLider;

 // ---- Setup PDF ----
 var pdf = new jsPDF();
 var PW = 210; var MX = 12; var y = 32;
 // columnas: izq = auto, der = lider
 var MID = PW / 2; // 105 — línea divisoria
 var COL_L = MX; // inicio columna izquierda (auto)
 var COL_R = MID + 3; // inicio columna derecha (lider)
 var COL_W = MID - MX - 3; // ancho de cada columna ~90mm

 function cab() {
 try { pdf.addImage('/logo.jpg', 'JPEG', MX, 6, 20, 20); } catch(e) {}
 }
 function pie() {
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(148, 163, 184);
 pdf.text('Fabric Group | ' + new Date().toLocaleDateString('es-AR'), MX, 291);
 }
 function nuevaPag() { pie(); pdf.addPage(); cab(); y = 30; }
 function chk(h) { if (y + h > 278) nuevaPag(); }

 // Normalizar texto para jsPDF helvetica (no soporta tildes)
 function t(str) {
 return (str || '')
 .replace(/[áàäâ]/g,'a').replace(/[éèëê]/g,'e').replace(/[íìïî]/g,'i')
 .replace(/[óòöô]/g,'o').replace(/[úùüû]/g,'u')
 .replace(/[ÁÀÄÂ]/g,'A').replace(/[ÉÈËÊ]/g,'E').replace(/[ÍÌÏÎ]/g,'I')
 .replace(/[ÓÒÖÔ]/g,'O').replace(/[ÚÙÜÛ]/g,'U')
 .replace(/[ñ]/g,'n').replace(/[Ñ]/g,'N')
 .replace(/[^\x00-\x7E]/g,'?');
 }
 function puntCirculo(x, yPos, valor, bgR, bgG, bgB, textR, textG, textB) {
 pdf.setFillColor(bgR, bgG, bgB);
 pdf.circle(x, yPos, 4.5, 'F');
 pdf.setTextColor(textR, textG, textB);
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
 var txt = String(valor);
 pdf.text(txt, x - (txt.length > 1 ? 2.5 : 1.5), yPos + 1.2);
 }

 cab();

 // ---- ENCABEZADO ----

 pdf.setFont('times', 'bold'); pdf.setFontSize(12); pdf.setTextColor(35, 31, 32); pdf.text('EVALUACIÓN DE DESEMPEÑO', MX, y); pdf.setFont('helvetica', 'normal'); y += 7;
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(71, 85, 105);
 pdf.text(t('Colaborador: ' + (d.colaborador.full_name || d.colaborador.email)), MX, y); y += 5;
 pdf.text(t('Puesto: ' + (d.colaborador.puesto || d.colaborador.area || '-') + ' | Area: ' + (d.colaborador.area || '-') + ' | Fecha: ' + new Date().toLocaleDateString('es-AR')), MX, y); y += 8;

 // ---- CABECERA DE COLUMNAS ----
 chk(12);
 pdf.setFillColor(35, 31, 32);
 pdf.rect(MX, y, COL_W, 8, 'F');
 pdf.rect(MID + 2, y, COL_W, 8, 'F');
 pdf.setTextColor(212, 210, 198); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
 pdf.text('AUTOEVALUACION (Colaborador)', COL_L + 2, y + 5.5);
 pdf.text('EVALUACION DEL LIDER', COL_R + 2, y + 5.5);
 y += 10;

 // ---- COMPETENCIAS — una por una ----
 var LINE_H = 4.5;
 var FONT_COM = 7;
 var COM_W = COL_W - 6;

 compsOrden.forEach(function(comp, idx) {
 var autoP = autoPunts[comp.id];
 var liderP = liderPunts[comp.id];
 var autoC = autoComs[comp.id] || '';
 var liderC = liderComs[comp.id] || '';

 // Calcular lineas antes de dibujar nada
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(FONT_COM);
 var textoAuto = autoC ? t(autoC) : 'Sin comentario';
 var textoLider = liderC ? t(liderC) : 'Sin comentario';
 var linAuto = pdf.splitTextToSize(textoAuto, COM_W);
 var linLider = pdf.splitTextToSize(textoLider, COM_W);
 var maxLineas = Math.max(linAuto.length, linLider.length);

 var cabH = 8;
 var cuerpoH = Math.max(20, 13 + maxLineas * LINE_H + 4);
 var totalH = cabH + cuerpoH;

 chk(totalH + 4);

 var yStart = y;
 var yCuerpo = yStart + cabH;

 // 1. Fondos primero
 pdf.setFillColor(212, 210, 198);
 pdf.rect(MX, yStart, PW - MX * 2, cabH, 'F');

 if (idx % 2 === 0) { pdf.setFillColor(248, 248, 245); } else { pdf.setFillColor(255, 255, 255); }
 pdf.rect(MX, yCuerpo, PW - MX * 2, cuerpoH, 'F');

 // 2. Nombre competencia
 pdf.setTextColor(35, 31, 32); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
 pdf.text(t(comp.nombre.toUpperCase()), MX + 2, yStart + 5.5);

 // 3. Linea divisoria vertical
 pdf.setDrawColor(200, 198, 190); pdf.setLineWidth(0.3);
 pdf.line(MID, yCuerpo, MID, yCuerpo + cuerpoH);

 // 4. Etiquetas columna
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5); pdf.setTextColor(100, 116, 139);
 pdf.text('AUTOEVALUACION', COL_L + 2, yCuerpo + 4);
 pdf.text('EVALUACION LIDER', COL_R + 2, yCuerpo + 4);

 // 5. Puntajes
 // 5. Puntajes — sin círculo, solo texto
 var yPunt = yCuerpo + 9;
 if (autoP) {
   pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(35, 31, 32);
   pdf.text('' + autoP + ' / 5', COL_L + 2, yPunt + 1.5);
 } else {
   pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); pdf.setTextColor(148, 163, 184);
   pdf.text('Sin puntaje', COL_L + 2, yPunt + 1.5);
 }
 if (liderP) {
   pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(35, 31, 32);
   pdf.text('' + liderP + ' / 5', COL_R + 2, yPunt + 1.5);
 } else {
   pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); pdf.setTextColor(148, 163, 184);
   pdf.text('Sin puntaje', COL_R + 2, yPunt + 1.5);
 }

 var yComent = yPunt + 8;
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(FONT_COM);
 pdf.setTextColor(50, 50, 50);
 linAuto.forEach(function(l, i) { pdf.text(l, COL_L + 2, yComent + i * LINE_H); });
 linLider.forEach(function(l, i) { pdf.text(l, COL_R + 2, yComent + i * LINE_H); });

 y = yStart + totalH + 2;
 pdf.setDrawColor(212, 210, 198); pdf.setLineWidth(0.2);
 pdf.line(MX, y, PW - MX, y);
 y += 2;
 });



 y += 4;

 // ---- COMENTARIOS FINALES ----
 if (autoComentFin || liderComentFin) {
 chk(20);
 pdf.setFillColor(35, 31, 32); pdf.rect(MX, y, PW - MX * 2, 7, 'F');
 pdf.setTextColor(212, 210, 198); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
 pdf.text('COMENTARIOS FINALES', MX + 2, y + 5); y += 9;

 if (autoComentFin) {
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(35, 31, 32);
 pdf.text('Colaborador:', MX, y); y += 4;
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(71, 85, 105);
 var lA = pdf.splitTextToSize(t(autoComentFin), PW - MX * 2);
 chk(lA.length * 4 + 3);
 lA.forEach(function(l) { pdf.text(t(l), MX, y); y += 4; });
 y += 3;
 }
 if (liderComentFin) {
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(35, 31, 32);
 pdf.text('Lider:', MX, y); y += 4;
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(71, 85, 105);
 var lL = pdf.splitTextToSize(t(liderComentFin), PW - MX * 2);
 chk(lL.length * 4 + 3);
 lL.forEach(function(l) { pdf.text(t(l), MX, y); y += 4; });
 y += 3;
 }
 }

 // ---- RATINGS RESUMEN + CALIBRADO ----
 chk(52);
 y += 4;
 pdf.setFillColor(35, 31, 32); pdf.rect(MX, y, PW - MX * 2, 7, 'F');
 pdf.setTextColor(212, 210, 198); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
 pdf.text('RESULTADO FINAL', MX + 2, y + 5); y += 10;

 // ratings auto y lider lado a lado
 var clA = clasificarRating(parseFloat(promAuto));
 var clL = clasificarRating(parseFloat(promLider));
 var boxW = (PW - MX * 2 - 4) / 2;
 if (promAuto) {
 pdf.setFillColor(245, 245, 245); pdf.rect(MX, y, boxW, 14, 'F');
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(35, 31, 32);
 pdf.text('Autoevaluacion', MX + 2, y + 5);
 pdf.setFontSize(14); pdf.text(String(promAuto), MX + 2, y + 12);
 if (clA) { pdf.setFontSize(6); pdf.setTextColor(clA.color.startsWith('#') ? parseInt(clA.color.slice(1,3),16) : 35, clA.color.startsWith('#') ? parseInt(clA.color.slice(3,5),16) : 31, clA.color.startsWith('#') ? parseInt(clA.color.slice(5,7),16) : 32); pdf.text(clA.label, MX + 14, y + 12); }
 }
 if (promLider) {
 pdf.setFillColor(240, 240, 240); pdf.rect(MX + boxW + 4, y, boxW, 14, 'F');
 pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(35, 31, 32);
 pdf.text('Evaluacion del Lider', MX + boxW + 6, y + 5);
 pdf.setFontSize(14); pdf.text(String(promLider), MX + boxW + 6, y + 12);
 if (clL) { pdf.setFontSize(6); pdf.setTextColor(clL.color.startsWith('#') ? parseInt(clL.color.slice(1,3),16) : 35, clL.color.startsWith('#') ? parseInt(clL.color.slice(3,5),16) : 31, clL.color.startsWith('#') ? parseInt(clL.color.slice(5,7),16) : 32); pdf.text(clL.label, MX + boxW + 20, y + 12); }
 }
 y += 18;

 // calibrado — grande y centrado
 var rf = d.ratingFinal;
 if (rf) {
 var clCal = clasificarRating(parseFloat(rf));
 pdf.setFillColor(35, 31, 32); pdf.rect(MX, y, PW - MX * 2, 28, 'F');
 pdf.setTextColor(212, 210, 198); pdf.setFont('helvetica', 'bold');
 pdf.setFontSize(7); pdf.text('RATING CALIBRADO FINAL', MX + 4, y + 6);
 pdf.setFontSize(28); pdf.text(String(rf), MX + 4, y + 22);
 if (clCal) {
 pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
 pdf.text(clCal.label, MX + 22, y + 22);
 }
 y += 32;
 } else {
 pdf.setFillColor(245, 245, 245); pdf.rect(MX, y, PW - MX * 2, 12, 'F');
 pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
 pdf.text('Rating calibrado pendiente', MX + 4, y + 8); y += 14;
 }

 if (d.comentarioCalibracion) {
 chk(12);
 pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(71, 85, 105);
 var lJ = pdf.splitTextToSize(t('Justificacion: ' + d.comentarioCalibracion), PW - MX * 2);
 lJ.forEach(function(l) { pdf.text(t(l), MX, y); y += 4; });
 }


 pie();
 return pdf;
 }
 async function verPDF(d) { var pdf = await generarPDFCompleto(d); pdf.save('Evaluacion_' + (d.colaborador.full_name || d.colaborador.email).split(' ').join('_') + '.pdf'); }

 // ── Selección múltiple para exportación masiva ──────────────────────────────
 function toggleSeleccion(colabId) {
   setSeleccionados(function(prev) {
     return prev.includes(colabId) ? prev.filter(function(id) { return id !== colabId; }) : [...prev, colabId];
   });
 }
 function toggleSeleccionarTodos(lista) {
   var idsVisibles = lista.map(function(d) { return d.colaborador.id; });
   var todosSeleccionados = idsVisibles.length > 0 && idsVisibles.every(function(id) { return seleccionados.includes(id); });
   if (todosSeleccionados) {
     setSeleccionados(function(prev) { return prev.filter(function(id) { return !idsVisibles.includes(id); }); });
   } else {
     setSeleccionados(function(prev) { return [...new Set([...prev, ...idsVisibles])]; });
   }
 }

 // Descarga un PDF por cada colaborador seleccionado (con pequeña pausa entre cada uno para que el navegador no bloquee las descargas)
 async function descargarPDFsSeleccionados() {
   var elegidos = datos.filter(function(d) { return seleccionados.includes(d.colaborador.id); });
   if (elegidos.length === 0) { alert('Seleccioná al menos un participante.'); return; }
   setExportando(true);
   for (var i = 0; i < elegidos.length; i++) {
     await verPDF(elegidos[i]);
     await new Promise(function(res) { setTimeout(res, 400); });
   }
   setExportando(false);
 }

 // Genera un único Excel con una hoja por colaborador seleccionado
 async function exportarExcelSeleccionados() {
   var elegidos = datos.filter(function(d) { return seleccionados.includes(d.colaborador.id); });
   if (elegidos.length === 0) { alert('Seleccioná al menos un participante.'); return; }
   setExportando(true);
   try {
     var XLSX = await import('xlsx');
     var wb = XLSX.utils.book_new();
     for (var i = 0; i < elegidos.length; i++) {
       var d = elegidos[i];
       var datosFrescos = await obtenerDatosEvaluacionCompleta(d);
       var filas = datosFrescos.compsOrden.map(function(c) {
         return {
           'Competencia': c.nombre,
           'Puntaje Auto': datosFrescos.autoPunts[c.id] || '',
           'Comentario Auto': datosFrescos.autoComs[c.id] || '',
           'Puntaje Lider': datosFrescos.liderPunts[c.id] || '',
           'Comentario Lider': datosFrescos.liderComs[c.id] || '',
         };
       });
       filas.push({ 'Competencia': '', 'Puntaje Auto': '', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Comentarios finales - Colaborador', 'Puntaje Auto': datosFrescos.autoComentFin || '-', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Comentarios finales - Lider', 'Puntaje Auto': datosFrescos.liderComentFin || '-', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Rating Promedio Auto', 'Puntaje Auto': datosFrescos.promAuto || '-', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Rating Promedio Lider', 'Puntaje Auto': datosFrescos.promLider || '-', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Rating Calibrado Final', 'Puntaje Auto': d.ratingFinal || 'Pendiente', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       filas.push({ 'Competencia': 'Justificacion Calibracion', 'Puntaje Auto': d.comentarioCalibracion || '-', 'Comentario Auto': '', 'Puntaje Lider': '', 'Comentario Lider': '' });
       var ws = XLSX.utils.json_to_sheet(filas);
       ws['!cols'] = [30, 14, 35, 14, 35].map(function(w) { return { wch: w }; });
       var nombreHoja = (d.colaborador.full_name || d.colaborador.email || 'Colaborador').substring(0, 31).replace(/[\\\/\?\*\[\]:]/g, '');
       XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
     }
     var fecha = new Date().toISOString().slice(0, 10);
     XLSX.writeFile(wb, 'Calibracion_evaluaciones_' + fecha + '.xlsx');
   } finally {
     setExportando(false);
   }
 }

 var areas = useMemo(function() { return ['Todas'].concat([...new Set(datos.map(function(d) { return d.colaborador.area; }).filter(Boolean))]); }, [datos]);
 var df = filtro === 'Todas' ? datos : datos.filter(function(d) { return d.colaborador.area === filtro; });

 if (carg) return <p style={{ padding: 20 }}> Cargando datos de calibracion...</p>;

 return (
 <div style={{ ...s.tarjetaStat }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
 <h3 style={{ margin: 0, color: '#231F20' }}> Calibracion - Auto vs Lider</h3>
 <select value={filtro} onChange={function(e) { setFiltro(e.target.value); }} style={{ padding: '8px 12px', borderRadius: 6, border: '2px solid #D4D2C6', fontSize: 14, background: 'white' }}>{areas.map(function(a) { return <option key={a} value={a}>{a}</option>; })}</select>
 </div>
 <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>Comparacion de autoevaluacion y evaluacion del lider. Define el rating final calibrado.</p>

      {/* Barra de exportación masiva */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', background: '#F0EDE8', borderRadius: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#231F20' }}>
          {seleccionados.length > 0 ? seleccionados.length + ' seleccionado(s)' : 'Seleccioná uno o más participantes'}
        </span>
        <button
          onClick={descargarPDFsSeleccionados}
          disabled={seleccionados.length === 0 || exportando}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: seleccionados.length === 0 || exportando ? '#D4D2C6' : '#f59e0b', color: 'white', fontSize: 12, fontWeight: 700, cursor: seleccionados.length === 0 || exportando ? 'default' : 'pointer' }}>
          {exportando ? 'Procesando...' : 'Descargar PDFs seleccionados'}
        </button>
        <button
          onClick={exportarExcelSeleccionados}
          disabled={seleccionados.length === 0 || exportando}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: seleccionados.length === 0 || exportando ? '#D4D2C6' : '#166534', color: 'white', fontSize: 12, fontWeight: 700, cursor: seleccionados.length === 0 || exportando ? 'default' : 'pointer' }}>
          {exportando ? 'Procesando...' : 'Exportar Excel (todos juntos)'}
        </button>
        {seleccionados.length > 0 && (
          <button onClick={function() { setSeleccionados([]); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D4D2C6', background: 'white', color: '#231F20', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Limpiar selección
          </button>
        )}
      </div>

      {/* Modal de historial de calibración — ventana aparte */}
      {showHistorial && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
             onClick={function() { setShowHistorial(false); setHistorial([]); setHistorialError(null); }}>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 24, width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
               onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h4 style={{ margin: 0, color: '#231F20' }}>Historial de Calibración</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
                {datos.find(function(d) { return d.colaborador.id === colaboradorHist; })?.colaborador.full_name || ''}
              </p>
            </div>
            <button onClick={function() { setShowHistorial(false); setHistorial([]); setHistorialError(null); }} style={s.btnInfo}>Cerrar</button>
          </div>

          {/* Agregar comentario — queda grabado en el historial (solo si no es modo lectura) */}
          {!soloLectura && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                value={nuevoComentario}
                onChange={function(e) { setNuevoComentario(e.target.value); }}
                placeholder="Agregar comentario o nota de calibración..."
                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13 }}
                onKeyDown={function(e) { if (e.key === 'Enter') agregarComentario(colaboradorHist); }}
              />
              <button onClick={function() { agregarComentario(colaboradorHist); }} style={s.btnPrimario}>Agregar</button>
            </div>
          )}

          {/* Lista de eventos */}
          {historialError ? (
            <p style={{ color: '#dc2626', fontSize: 13, textAlign: 'center', padding: 20, background: '#fee2e2', borderRadius: 8 }}>
              No se pudo cargar el historial: {historialError}
            </p>
          ) : historial.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>Sin registros aún.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historial.map(function(h) {
                var colores = {
                  reabrir_auto: { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', label: 'Reapertura Auto' },
                  reabrir_lider: { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', label: 'Reapertura Líder' },
                  calibracion: { bg: '#dcfce7', border: '#86efac', color: '#166534', label: 'Calibración' },
                  comentario: { bg: '#F0EDE8', border: '#D4D2C6', color: '#231F20', label: 'Comentario' },
                };
                var c = colores[h.tipo] || colores.comentario;
                return (
                  <div key={h.id} style={{ padding: '10px 14px', borderRadius: 8, background: c.bg, border: '1px solid ' + c.border, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, whiteSpace: 'nowrap', paddingTop: 2 }}>{c.label}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#231F20', lineHeight: 1.5 }}>{h.comentario}</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8' }}>
                        {h.usuario_nombre} · {new Date(h.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Modal: motivo de reapertura (obligatorio) — reemplaza window.prompt */}
      {reabriendo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 460, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#231F20' }}>Reabrir {reabriendo.tipo}</h4>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
              {reabriendo.colaboradorNombre} — esto va a quedar registrado en el historial de calibración.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#231F20', display: 'block', marginBottom: 6 }}>
              Motivo de reapertura (obligatorio)
            </label>
            <textarea
              value={motivoReapertura}
              onChange={function(e) { setMotivoReapertura(e.target.value); }}
              placeholder="Ej: el líder cargó un puntaje incorrecto en Liderazgo..."
              style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 8, border: '2px solid #D4D2C6', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={function() { setReabriendo(null); setMotivoReapertura(""); }} style={s.btnInfo}>
                Cancelar
              </button>
              <button onClick={confirmarReapertura} disabled={!motivoReapertura.trim()} style={{ ...s.btnPrimario, opacity: motivoReapertura.trim() ? 1 : 0.5, cursor: motivoReapertura.trim() ? 'pointer' : 'default' }}>
                Confirmar reapertura
              </button>
            </div>
          </div>
        </div>
      )}

 {df.length === 0 ? <p style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No hay datos para mostrar.</p> : (
 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
<thead><tr style={{ borderBottom: '2px solid #e8e6e0', background: '#F0EDE8' }}><th style={{ ...th, width: 36 }}><input type="checkbox" checked={df.length > 0 && df.every(function(d) { return seleccionados.includes(d.colaborador.id); })} onChange={function() { toggleSeleccionarTodos(df); }} /></th><th style={th}>Colaborador</th><th style={th}>Area</th><th style={th}>Seniority</th><th style={th}>Auto</th><th style={th}>Lider</th><th style={th}>Evaluación Final</th><th style={th}>Justificación</th><th style={th}>Historial</th><th style={th}>PDF</th><th style={th}>Reabrir</th></tr></thead>
 <tbody>{df.map(function(d) {
 var gap = d.promAuto && d.promLider ? (parseFloat(d.promLider) - parseFloat(d.promAuto)).toFixed(1) : null;
 var clasifAuto = clasificarRating(parseFloat(d.promAuto));
 var clasifLider = clasificarRating(parseFloat(d.promLider));
 return (
 <tr key={d.colaborador.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
 <td style={td}><input type="checkbox" checked={seleccionados.includes(d.colaborador.id)} onChange={function() { toggleSeleccion(d.colaborador.id); }} /></td>
 <td style={td}><strong>{d.colaborador.full_name || d.colaborador.email}</strong></td>
 <td style={td}>{d.colaborador.area || '-'}</td>
 <td style={td}><span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#D4D2C6', color: '#231F20' }}>{d.colaborador.seniority || '-'}</span></td>
 <td style={{ ...td, textAlign: 'center' }}>
 <div style={{ fontSize: 16, fontWeight: 700 }}>{d.promAuto || '-'}</div>
 {clasifAuto && <div style={{ fontSize: 9, color: clasifAuto.color, fontWeight: 600 }}>{clasifAuto.label}</div>}
 </td>
 <td style={{ ...td, textAlign: 'center' }}>
 <div style={{ fontSize: 16, fontWeight: 700 }}>{d.promLider || '-'}</div>
 {clasifLider && <div style={{ fontSize: 9, color: clasifLider.color, fontWeight: 600 }}>{clasifLider.label}</div>}
 </td>
 <td style={{ ...td, textAlign: 'center', minWidth: 140 }}>
 {d.evaluacionLider ? (
 <div>
 {/* Valor */}
 <div style={{ fontSize: 20, fontWeight: 800, color: '#231F20', lineHeight: 1 }}>
 {d.ratingFinal || d.promLider || '-'}
 </div>
 {clasificarRating(parseFloat(d.ratingFinal || d.promLider)) && (
 <div style={{ fontSize: 9, color: clasificarRating(parseFloat(d.ratingFinal || d.promLider)).color, fontWeight: 700, marginBottom: 8, marginTop: 2 }}>
 {clasificarRating(parseFloat(d.ratingFinal || d.promLider)).label}
 </div>
 )}
 {/* Botones acción — solo si no soloLectura */}
 {!soloLectura && (
 <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
 {editandoCal !== d.colaborador.id && !d.ratingFinal && (
 <button
   onClick={async function() {
     var _evId = d.evaluacionLider.id;
     var _pl = parseFloat(d.promLider) || 0;
     if (!_pl) { alert('El lider aun no tiene rating promedio'); return; }
     await guardarCal(_evId, _pl, 'Confirmado sin cambios — rating igual al del lider', _pl);
     // Registrar en historial
     var { data: { session } } = await supabase.auth.getSession();
     await supabase.from('calibracion_historial').insert({
       ciclo_id: cicloId,
       colaborador_id: d.colaborador.id,
       evaluacion_id: _evId,
       tipo: 'calibracion',
       comentario: 'Rating calibrado confirmado: ' + _pl + ' (igual al rating del lider, sin cambios)',
       usuario_id: session.user.id,
       usuario_nombre: session.user.email
     });
   }}
   title="Confirmar como evaluacion final"
   style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #86efac', background: '#dcfce7', color: '#166534', cursor: 'pointer', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
   ✓
 </button>
 )}
 {editandoCal !== d.colaborador.id && !d.ratingFinal && (
 <button
 onClick={function() { var _id = d.colaborador.id; setEditandoCal(_id); setCalTemp({ rating: d.ratingFinal || d.promLider || '', comentario: d.comentarioCalibracion || '' }); }}
 title="Editar evaluacion final"
 style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e8e6e0', background: 'white', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✏
 </button>
 )}
 {editandoCal === d.colaborador.id && (
 <button
 onClick={function() { setEditandoCal(null); }}
 title="Cancelar"
 style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e8e6e0', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
 </button>
 )}
 </div>
 )}
 </div>
 ) : (
 <span style={{ color: '#94a3b8', fontSize: 12 }}>Sin evaluación</span>
 )}
 </td>
 <td style={{ ...td, minWidth: 260 }}>
 {editandoCal === d.colaborador.id ? (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
 <select value={calTemp.rating} onChange={function(e) { setCalTemp({ ...calTemp, rating: e.target.value }); }}
 style={{ padding: '7px 10px', borderRadius: 8, border: '2px solid #231F20', fontSize: 14, fontWeight: 700, background: 'white' }}>
 <option value="">Seleccionar</option>
 {['1.0','1.1','1.2','1.3','1.4','1.5','1.6','1.7','1.8','1.9','2.0','2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','2.9','3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','3.9','4.0','4.1','4.2','4.3','4.4','4.5','4.6','4.7','4.8','4.9','5.0'].map(function(v) { return <option key={v} value={v}>{v}</option>; })}
 </select>
 {parseFloat(calTemp.rating) !== parseFloat(d.promLider) && (
 <textarea value={calTemp.comentario} onChange={function(e) { setCalTemp({ ...calTemp, comentario: e.target.value }); }}
 placeholder="Justificación obligatoria si difiere del líder..."
 style={{ padding: 8, borderRadius: 8, border: '2px solid #f59e0b', fontSize: 12, fontFamily: 'inherit', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', width: '100%' }} />
 )}
 {parseFloat(calTemp.rating) === parseFloat(d.promLider) && (
 <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>Sin cambios — igual al líder, no requiere justificación</p>
 )}
 <button
 onClick={async function() {
 if (!calTemp.rating) return alert('Seleccioná un rating');
 if (parseFloat(calTemp.rating) !== parseFloat(d.promLider) && !calTemp.comentario.trim()) return alert('La justificación es obligatoria cuando el rating difiere del líder');
 var _evId = d.evaluacionLider.id; var _r = parseFloat(calTemp.rating); var _c = calTemp.comentario; var _pl = d.promLider;
 var ok = await guardarCal(_evId, _r, _c, _pl);
  if (!ok) return;
  var { data: { session } } = await supabase.auth.getSession();
  await supabase.from('calibracion_historial').insert({
    ciclo_id: cicloId,
    colaborador_id: d.colaborador.id,
    evaluacion_id: _evId,
    tipo: 'calibracion',
    comentario: 'Rating calibrado: ' + _r + (_c ? '. Justificacion: ' + _c : ''),
    usuario_id: session.user.id,
    usuario_nombre: session.user.email
  });
  setEditandoCal(null);
 }}
 style={{ ...s.btnPrimario, background: '#166534', padding: '8px 16px', fontSize: 12 }}>
 Confirmar
 </button>
 </div>
 ) : (
 <span style={{ fontSize: 12, color: d.comentarioCalibracion ? '#475569' : '#94a3b8', fontStyle: d.comentarioCalibracion ? 'normal' : 'italic', wordBreak: 'break-word' }}>
 {d.liderReabierto ? 'Cambio la evaluacion del lider — ver historial' : d.ratingFinal ? (d.comentarioCalibracion || 'Confirmado sin cambios') : '—'}
 </span>
 )}
 </td>
 <td style={td}><button onClick={function() { cargarHistorial(d.colaborador.id); }} style={{ background: '#D4D2C6', color: '#231F20', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}>Ver</button></td>
 <td style={td}><button onClick={function() { verPDF(d); }} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Ver PDF</button></td>
                  <td style={{ ...td, minWidth: 160 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {d.autoevaluacion && d.autoevaluacion.estado === 'enviado' && (
                        <button onClick={function() { iniciarReapertura(d.autoevaluacion.id, 'autoevaluación', d.colaborador.id, d.colaborador.full_name); }}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          Reabrir Auto
                        </button>
                      )}
                      {d.evaluacionLider && d.evaluacionLider.estado === 'enviado' && (
                        <button onClick={function() { iniciarReapertura(d.evaluacionLider.id, 'evaluación del líder', d.colaborador.id, d.colaborador.full_name); }}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1e40af', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          Reabrir Líder
                        </button>
                      )}
                      {(!d.autoevaluacion || d.autoevaluacion.estado !== 'enviado') && (!d.evaluacionLider || d.evaluacionLider.estado !== 'enviado') && (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin envíos</span>
                      )}
                      <button onClick={function() { cargarHistorial(d.colaborador.id); }}
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #D4D2C6", background: "white", color: "#231F20", cursor: "pointer", fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                        Ver historial
                      </button>
                    </div>
                  </td>
 </tr>
 );
 })}</tbody>
 </table>
 </div>
  )}
 </div>
 );
}

function FeedbackAdmin({ cicloId }) { var [fbs, setFbs] = useState([]); var [carg, setCarg] = useState(true); useEffect(function() { (async function() { var { data } = await supabase.from('feedback').select('*,lider:lider_id(email,full_name),colaborador:colaborador_id(email,full_name)').eq('ciclo_id', cicloId).order('created_at', { ascending: false }); setFbs(data || []); setCarg(false); })(); }, [cicloId]); if (carg) return <p>Cargando...</p>; return <div style={s.tarjetaStat}><h4> Feedback ({fbs.length})</h4>{fbs.length === 0 ? <p style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Sin registros.</p> : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Lider</th><th style={th}>Colaborador</th><th style={th}>Comentario</th><th style={th}>Fecha</th><th style={th}>OK</th></tr></thead><tbody>{fbs.map(function(f) { return (<tr key={f.id}><td style={td}>{f.lider?.full_name || '-'}</td><td style={td}>{f.colaborador?.full_name || '-'}</td><td style={td}>{f.comentario_lider || '-'}</td><td style={td}>{f.fecha_feedback_lider ? new Date(f.fecha_feedback_lider).toLocaleDateString('es-AR') : '-'}</td><td style={{ ...td, textAlign: 'center' }}>{f.confirmacion_colaborador ? <span style={{ color: '#166534', fontWeight: 800, fontSize: 16 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>-</span>}</td></tr>); })}</tbody></table>}</div>; }

function HistorialAdmin({ colaborador, onVolver }) { var [hist, setHist] = useState([]); var [carg, setCarg] = useState(true); useEffect(function() { (async function() { var { data } = await supabase.from('evaluaciones_historicas').select('*').eq('colaborador_id', colaborador.id).order('fecha_evaluacion', { ascending: false }); setHist(data || []); setCarg(false); })(); }, []); if (carg) return <p>Cargando...</p>; return <div><button onClick={onVolver} style={{ ...s.btnInfo, marginBottom: 16 }}>Volver</button><h3>Ver Historial: {colaborador.full_name || colaborador.email}</h3>{hist.length === 0 ? <p style={{ padding: 40, color: '#94a3b8' }}>Sin historial.</p> : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Fecha</th><th style={th}>Rating</th></tr></thead><tbody>{hist.map(function(h) { return (<tr key={h.id}><td style={td}>{new Date(h.fecha_evaluacion + 'T12:00:00').toLocaleDateString('es-AR')}</td><td style={td}>{h.rating_final || '-'}</td></tr>); })}</tbody></table>}</div>; }

// =============================================
// EQUIPO LIDER
// =============================================
function EquipoLider({ cicloId, profile, soloLectura }) {
 var [equipo, setEquipo] = useState([]);
 var [colSel, setColSel] = useState(null);
 var [soloLecturaColSel, setSoloLecturaColSel] = useState(false); // CAMBIO 2: controla si el colaborador seleccionado es solo lectura
 var [fbVis, setFbVis] = useState(null);
 var [busqueda, setBusqueda] = useState('');
 var [filtroArea, setFiltroArea] = useState('Todas');
 var [cargando, setCargando] = useState(true);

 useEffect(function() { cargar(); }, [cicloId]);

 async function cargar() {
   var { data: { session } } = await supabase.auth.getSession();
   if (!session) return;
   var uid = session.user.id;

   var { data: visibilidad } = await supabase.from('equipo_visibilidad').select('tipo, valor').eq('lider_id', uid);
   var todosLosColabs = [];

   if (visibilidad && visibilidad.length > 0) {
     var esTodos = visibilidad.some(function(v) { return v.tipo === 'todos'; });
     if (esTodos) {
       var { data: todos } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).neq('id', uid).order('full_name');
       todosLosColabs = todos || [];
     } else {
       var areas = visibilidad.filter(function(v) { return v.tipo === 'area'; }).map(function(v) { return v.valor; });
       var usuarios = visibilidad.filter(function(v) { return v.tipo === 'usuario'; }).map(function(v) { return v.valor; });
       var queries = [];
       if (areas.length > 0) {
         var { data: porArea } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).in('area', areas).order('full_name');
         queries = queries.concat(porArea || []);
       }
       if (usuarios.length > 0) {
         var { data: porUsuario } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).in('id', usuarios);
         queries = queries.concat(porUsuario || []);
       }
       var vistos = {};
       todosLosColabs = queries.filter(function(c) { if (vistos[c.id]) return false; vistos[c.id] = true; return true; });
     }
   }

   // Siempre agregar reportes directos
   var { data: directos } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('leader_id', uid).eq('activo', true);
   (directos || []).forEach(function(c) {
     if (!todosLosColabs.find(function(x) { return x.id === c.id; })) todosLosColabs.push(c);
   });

   todosLosColabs.sort(function(a, b) { return (a.full_name || '').localeCompare(b.full_name || ''); });
   setEquipo(todosLosColabs);
   setCargando(false);
 }

 // CAMBIO 2: al seleccionar un colaborador se guarda si es solo lectura o no
 if (colSel) return (
   <EvaluacionLider
     colaborador={colSel}
     cicloId={cicloId}
     onVolver={function() { setColSel(null); setSoloLecturaColSel(false); cargar(); }}
     soloLectura={soloLecturaColSel}
   />
 );

 if (fbVis) return <FeedbackForm feedback={fbVis} cicloId={cicloId} onVolver={function() { setFbVis(null); cargar(); }} />;

 var areas = ['Todas'].concat([...new Set(equipo.map(function(c) { return c.area; }).filter(Boolean))].sort());
 var equipoFiltrado = equipo.filter(function(c) {
   if (filtroArea !== 'Todas' && c.area !== filtroArea) return false;
   if (busqueda && !(c.full_name || '').toLowerCase().includes(busqueda.toLowerCase()) && !(c.puesto || '').toLowerCase().includes(busqueda.toLowerCase())) return false;
   return true;
 });

 if (cargando) return <p style={{ color: '#64748b', padding: 20 }}>Cargando equipo...</p>;

 return (
   <div>
     {/* Header */}
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
       <div>
         <h2 style={{ margin: '0 0 4px 0', color: '#231F20', fontSize: 20, fontWeight: 700 }}>Mi Equipo</h2>
         <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{equipoFiltrado.length} de {equipo.length} colaboradores</p>
       </div>
     </div>

     {/* Buscador y filtros */}
     <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
       <input
         value={busqueda}
         onChange={function(e) { setBusqueda(e.target.value); }}
         placeholder="Buscar por nombre o puesto..."
         style={{ flex: 2, minWidth: 200, padding: '9px 14px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
       />
       <select
         value={filtroArea}
         onChange={function(e) { setFiltroArea(e.target.value); }}
         style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', minWidth: 160 }}
       >
         {areas.map(function(a) { return <option key={a} value={a}>{a === 'Todas' ? 'Todas las áreas' : a}</option>; })}
       </select>
       {(busqueda || filtroArea !== 'Todas') && (
         <button onClick={function() { setBusqueda(''); setFiltroArea('Todas'); }} style={{ ...s.btnInfo, color: '#dc2626', borderColor: '#fca5a5' }}>Limpiar</button>
       )}
     </div>

     {/* Lista */}
     {equipoFiltrado.length === 0 ? (
       <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e8e6e0' }}>
         {equipo.length === 0 ? 'No tenés colaboradores asignados.' : 'Sin resultados para los filtros seleccionados.'}
       </div>
     ) : (
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
         {equipoFiltrado.map(function(c) {
           var iniciales = (c.full_name || c.email || 'U').split(' ').slice(0, 2).map(function(p) { return p[0]; }).join('').toUpperCase();

           // ── CAMBIO 2 ────────────────────────────────────────────────────────
           // esDirecto determina qué botón mostrar y si puede editar o no
           var esDirecto = c.leader_id === profile.id;
           // ── FIN CAMBIO 2 ────────────────────────────────────────────────────

           return (
             <div key={c.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '3px solid ' + (esDirecto ? '#231F20' : '#D4D2C6'), padding: '16px 18px' }}>
               <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                 <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#231F20', flexShrink: 0 }}>
                   {iniciales}
                 </div>
                 <div style={{ flex: 1, minWidth: 0 }}>
                   <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                     <strong style={{ fontSize: 14, color: '#231F20' }}>{c.full_name || c.email}</strong>
                     {/* CAMBIO 2: badge "Indirecto" para los que no son reportes directos */}
                     {!esDirecto && (
                       <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F0EDE8', color: '#64748b', fontWeight: 600 }}>
                         Indirecto
                       </span>
                     )}
                   </div>
                   <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>{c.puesto || c.area}</p>
                   <p style={{ margin: '1px 0 0 0', fontSize: 11, color: '#94a3b8' }}>{c.area}</p>
                 </div>
               </div>

               <div style={{ display: 'flex', gap: 8 }}>
                 {/* ── CAMBIO 2 ────────────────────────────────────────────────
                     Directo   → botón "Evaluar" (editable) o "Ver evaluación" si ciclo cerrado
                     Indirecto → botón "Visualizar" (siempre solo lectura, no evalúa)
                 ── FIN CAMBIO 2 ──────────────────────────────────────────── */}
                 {esDirecto ? (
                   <button
                     onClick={function() {
                       setSoloLecturaColSel(soloLectura); // hereda el soloLectura del ciclo
                       setColSel(c);
                     }}
                     style={{ ...s.btnPrimario, flex: 1, fontSize: 12, padding: '8px 12px', textAlign: 'center' }}
                   >
                     {soloLectura ? 'Ver evaluación' : 'Evaluar'}
                   </button>
                 ) : (
                   <button
                     onClick={function() {
                       setSoloLecturaColSel(true); // indirecto siempre es solo lectura
                       setColSel(c);
                     }}
                     style={{ ...s.btnInfo, flex: 1, fontSize: 12, padding: '8px 12px', textAlign: 'center', background: '#F0EDE8' }}
                   >
                     Visualizar
                   </button>
                 )}

                 {/* CAMBIO 2: Feedback solo para reportes directos */}
                 {esDirecto && (
                   <button
                     onClick={function() { setFbVis(c); }}
                     style={{ ...s.btnSecundario, fontSize: 12, padding: '8px 12px' }}
                   >
                     Feedback
                   </button>
                 )}
               </div>
             </div>
           );
         })}
       </div>
     )}
   </div>
 );
}


function FeedbackForm({ feedback: col, cicloId, onVolver }) {
 var [com, setCom] = useState('');
 var [fb, setFb] = useState(null);
 var [carg, setCarg] = useState(true);
 var [miEvaluacion, setMiEvaluacion] = useState(null);
 var [misPuntuaciones, setMisPuntuaciones] = useState([]);
 var [dandoOk, setDandoOk] = useState(false);

 useEffect(function() {
 (async function() {
 var { data: { session } } = await supabase.auth.getSession();
 // No usamos maybeSingle() acá: si por datos viejos hay más de una fila para este colaborador,
 // maybeSingle() tira error y se pierde el feedback. En cambio, traemos todas y nos quedamos
 // con la que tenga comentario (o la más reciente si ninguna lo tiene).
 var { data: filas, error } = await supabase.from('feedback').select('*').eq('ciclo_id', cicloId).eq('colaborador_id', col.id).order('created_at', { ascending: false });
 if (error) {
   console.error('Error cargando feedback existente:', error);
 } else if (filas && filas.length > 0) {
   var data = filas.find(function(f) { return f.comentario_lider; }) || filas[0];
   if (filas.length > 1) console.warn('Hay ' + filas.length + ' filas de feedback duplicadas para este colaborador (ciclo ' + cicloId + '). Conviene limpiar los duplicados en Supabase.');
   setFb(data); setCom(data.comentario_lider || '');
 } else {
   var { data: nuevo, error: insErr } = await supabase.from('feedback').insert({ ciclo_id: cicloId, lider_id: session.user.id, colaborador_id: col.id }).select().single();
   if (insErr) console.error('Error creando fila de feedback inicial:', insErr);
   else setFb(nuevo);
 }
 var { data: ev } = await supabase.from('evaluaciones')
   .select('id, rating_promedio, rating_calibrado, comentarios_finales, estado, aprobado_lider')
   .eq('colaborador_id', col.id).eq('tipo_evaluacion', 'evaluacion_lider').eq('ciclo_id', cicloId).maybeSingle();
 if (ev) {
   setMiEvaluacion(ev);
   var { data: punts } = await supabase.from('puntuaciones').select('rating, comentario, competencia_id, competencias(nombre)').eq('evaluacion_id', ev.id);
   setMisPuntuaciones(punts || []);
 }
 setCarg(false);
 })();
 }, []);

 async function guardar() {
 var { data: { session } } = await supabase.auth.getSession();
 var resultado;
 if (fb?.id) {
   // Ya existe una fila (la creada al abrir el formulario, o una previa) — actualizarla por id, sin depender de ninguna restricción UNIQUE
   resultado = await supabase.from('feedback').update({ comentario_lider: com, fecha_feedback_lider: new Date(), lider_id: session.user.id }).eq('id', fb.id).select().single();
 } else {
   // No había fila previa por algún motivo — crearla directamente
   resultado = await supabase.from('feedback').insert({ ciclo_id: cicloId, lider_id: session.user.id, colaborador_id: col.id, comentario_lider: com, fecha_feedback_lider: new Date() }).select().single();
 }
 if (resultado.error) {
   console.error('Error guardando feedback:', resultado.error);
   alert('No se pudo guardar el feedback: ' + resultado.error.message);
   return;
 }
 setFb(resultado.data);
 alert('Guardado'); onVolver();
 }

 async function darOk() {
 if (!miEvaluacion) return;
 if (!window.confirm('¿Confirmás que el colaborador puede ver tu evaluación?')) return;
 setDandoOk(true);
 await supabase.from('evaluaciones').update({ aprobado_lider: true }).eq('id', miEvaluacion.id);
 setMiEvaluacion({ ...miEvaluacion, aprobado_lider: true });
 setDandoOk(false);
 }

 if (carg) return <p>Cargando...</p>;
 var clasifMia = clasificarRating(parseFloat(miEvaluacion?.rating_calibrado || miEvaluacion?.rating_promedio));

 return (
 <div style={{ maxWidth: 700 }}>
 <button onClick={onVolver} style={{ ...s.btnInfo, marginBottom: 16 }}>Volver</button>
 <h3>Feedback: {col.full_name || col.email}</h3>
 {miEvaluacion && (
 <div style={{ ...s.tarjetaStat, marginBottom: 20 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
   <h4 style={{ margin: 0, color: '#231F20' }}>Mi evaluación a este colaborador</h4>
   {miEvaluacion.aprobado_lider ? (
     <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#166534' }}>✓ OK dado — el colaborador puede verla</span>
   ) : (
     <button onClick={darOk} disabled={dandoOk || miEvaluacion.estado !== 'enviado'} style={{ ...s.btnPrimario, opacity: (dandoOk || miEvaluacion.estado !== 'enviado') ? 0.5 : 1 }}>
       {dandoOk ? 'Guardando...' : 'Dar OK al colaborador'}
     </button>
   )}
 </div>
 {miEvaluacion.estado !== 'enviado' && <p style={{ fontSize: 12, color: '#92400e', margin: '0 0 14px 0', fontStyle: 'italic' }}>Tenés que enviar tu evaluación antes de poder dar el OK.</p>}
 {(miEvaluacion.rating_calibrado || miEvaluacion.rating_promedio) && (
   <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
     <span style={{ fontSize: 36, fontWeight: 800, color: clasifMia?.color || '#231F20' }}>{miEvaluacion.rating_calibrado || miEvaluacion.rating_promedio}</span>
     {clasifMia && <span style={{ fontSize: 13, fontWeight: 600, color: clasifMia.color }}>{clasifMia.label}</span>}
   </div>
 )}
 {misPuntuaciones.length > 0 && (
   <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
     <tbody>
       {misPuntuaciones.map(function(p) {
         return (
           <tr key={p.competencia_id} style={{ borderBottom: '1px solid #f1f0ec' }}>
             <td style={{ padding: '6px 4px', fontSize: 13, color: '#231F20' }}>{p.competencias?.nombre}</td>
             <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 700, color: '#231F20', width: 40 }}>{p.rating}</td>
           </tr>
         );
       })}
     </tbody>
   </table>
 )}
 {miEvaluacion.comentarios_finales && <p style={{ fontSize: 13, color: '#475569', fontStyle: 'italic', margin: 0 }}>{miEvaluacion.comentarios_finales}</p>}
 </div>
 )}
 <textarea value={com} onChange={function(e) { setCom(e.target.value); }} placeholder="Deja tu feedback..." style={{ ...s.textarea, minHeight: 120, marginBottom: 12 }} />
 {fb?.confirmacion_colaborador && <div style={{ padding: 12, background: '#dcfce7', borderRadius: 8, marginBottom: 16 }}>Confirmado</div>}
 <button onClick={guardar} style={s.btnPrimario}>Guardar</button>
 </div>
 );
}

// =============================================
// EVALUACIÓN LÍDER — con bloqueo post-envío
// =============================================
function EvaluacionLider({ colaborador, cicloId, onVolver, soloLectura }) {
 var [competencias, setComp] = useState([]);
 var [ratings, setRatings] = useState({});
 var [comentarios, setComent] = useState({});
 var [comFin, setComFin] = useState('');
 var [msg, setMsg] = useState('');
 var [carg, setCarg] = useState(true);
 var [autoEval, setAutoEval] = useState(null);
 var [autoPuntsMap, setAutoPuntsMap] = useState({});
 var [evalData, setEvalData] = useState(null);
 var [enviada, setEnviada] = useState(false);
 var [showInfo, setShowInfo] = useState({});

 useEffect(function() {
 (async function() {
 // Cargar competencias del seniority del colaborador
 // Si no trae nada (seniority no coincide exactamente), traer todas y deduplicar
 var { data: comps } = await supabase
 .from('competencias')
 .select('id, nombre, descripcion')
 .eq('aplica_a', colaborador.seniority)
 .order('nombre', { ascending: true });
 if (!comps || comps.length === 0) {
 // Fallback: traer todas y deduplicar por nombre
 var { data: todasComps } = await supabase
 .from('competencias').select('id, nombre, descripcion').order('nombre', { ascending: true });
 var vistos = {};
 comps = (todasComps || []).filter(function(c) {
 if (vistos[c.nombre]) return false;
 vistos[c.nombre] = true;
 return true;
 });
 console.log('Fallback — competencias deduplicadas:', comps.length);
 }
 setComp(comps || []);


 var { data: { session } } = await supabase.auth.getSession();


 // Siempre cargar autoevaluacion sin importar el estado
 var { data: ae, error: aeErr } = await supabase.from('evaluaciones')
 .select('id, estado, rating_promedio, comentarios_finales')
 .eq('colaborador_id', colaborador.id)
 .eq('tipo_evaluacion', 'autoevaluacion')
 .eq('ciclo_id', cicloId)
 .maybeSingle();
 if (ae) {
 // Query sin join para máxima compatibilidad
 var { data: ap, error: apErr } = await supabase.from('puntuaciones')
 .select('id, rating, comentario, competencia_id')
 .eq('evaluacion_id', ae.id);
 setAutoEval({ ...ae, puntuaciones: ap || [] });
 var mapa = {};
 (ap || []).forEach(function(p) {
 mapa[p.competencia_id] = { rating: p.rating, comentario: p.comentario || '' };
 });
 setAutoPuntsMap(mapa);
 }

 var { data: liderEval } = await supabase.from('evaluaciones')
 .select('id, estado, comentarios_finales, rating_promedio')
 .eq('colaborador_id', colaborador.id)
 .eq('tipo_evaluacion', 'evaluacion_lider')
 .eq('ciclo_id', cicloId)
 .maybeSingle();
 if (liderEval) {
 setEvalData(liderEval);
 setComFin(liderEval.comentarios_finales || '');
 var { data: punts } = await supabase.from('puntuaciones')
 .select('rating, competencia_id, comentario')
 .eq('evaluacion_id', liderEval.id);
 var rm = {}; var cm = {};
 (punts || []).forEach(function(p) { rm[p.competencia_id] = p.rating; cm[p.competencia_id] = p.comentario || ''; });
 setRatings(rm); setComent(cm);
 } else if (!soloLectura) {
 console.log('Creando evaluacion_lider — colaborador:', colaborador.id, 'evaluador:', session.user.id);
 var { data: nuevo, error: insertErr } = await supabase.from('evaluaciones')
 .insert({ colaborador_id: colaborador.id, evaluador_id: session.user.id, tipo_evaluacion: 'evaluacion_lider', estado: 'borrador', ciclo_id: cicloId })
 .select('id').single();
 if (nuevo) {
 setEvalData(nuevo);
 } else {
 console.error('FALLO insert — probablemente RLS:', insertErr?.message);
 // Intentar buscar si ya existe (race condition)
 var { data: existing } = await supabase.from('evaluaciones')
 .select('id, estado').eq('colaborador_id', colaborador.id)
 .eq('tipo_evaluacion', 'evaluacion_lider').eq('ciclo_id', cicloId).maybeSingle();
 if (existing) { console.log('Encontrada existente:', existing); setEvalData(existing); }
 }
 }
 })();
 }, []);

 // BORRADOR AUTOMÁTICO en evaluación del líder
 useEffect(function() {
   if (!evalData?.id || soloLectura || enviada || evalData?.estado === 'enviado') return;
   var timer = setTimeout(async function() {
     var evId = evalData.id;
     var prom = calcularRating(ratings);
     await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
     for (var cid of Object.keys(ratings)) {
       var r = ratings[cid]; if (!r) continue;
       var { data: ex } = await supabase.from('puntuaciones').select('id').eq('evaluacion_id', evId).eq('competencia_id', cid).maybeSingle();
       if (ex?.id) { await supabase.from('puntuaciones').update({ rating: r, comentario: comentarios[cid] || '' }).eq('id', ex.id); }
       else { await supabase.from('puntuaciones').insert({ evaluacion_id: evId, competencia_id: cid, rating: r, comentario: comentarios[cid] || '' }); }
     }
   }, 1500);
   return function() { clearTimeout(timer); };
 }, [ratings, comentarios, comFin, evalData?.id]);

 var yaEnviada = enviada || evalData?.estado === "enviado";
 var bloqueado = soloLectura || yaEnviada;

 async function obtenerOCrearEvalId() {
 if (evalData?.id) return evalData.id;
 var { data: ev } = await supabase.from('evaluaciones').select('id').eq('colaborador_id', colaborador.id).eq('tipo_evaluacion', 'evaluacion_lider').eq('ciclo_id', cicloId).maybeSingle();
 if (ev?.id) { setEvalData(ev); return ev.id; }
 var { data: { session } } = await supabase.auth.getSession();
 var { data: nuevo } = await supabase.from('evaluaciones').insert({ colaborador_id: colaborador.id, evaluador_id: session.user.id, tipo_evaluacion: 'evaluacion_lider', estado: 'borrador', ciclo_id: cicloId }).select('id').single();
 if (nuevo?.id) { setEvalData(nuevo); return nuevo.id; }
 return null;
 }

 async function guardarPuntuacionesLider(evId) {
 for (var cid of Object.keys(ratings)) {
 var r = ratings[cid];
 if (!r) continue;
 var { data: ex } = await supabase.from('puntuaciones')
 .select('id').eq('evaluacion_id', evId).eq('competencia_id', cid).maybeSingle();
 if (ex?.id) {
 await supabase.from('puntuaciones')
 .update({ rating: r, comentario: comentarios[cid] || '' }).eq('id', ex.id);
 } else {
 await supabase.from('puntuaciones')
 .insert({ evaluacion_id: evId, competencia_id: cid, rating: r, comentario: comentarios[cid] || '' });
 }
 }
 }

 async function guardar() {
 if (bloqueado) return;
 var evId = await obtenerOCrearEvalId();
 if (!evId) { setMsg('Error al guardar'); return; }
 setMsg('Guardando...');
 var prom = calcularRating(ratings);
 await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
 await guardarPuntuacionesLider(evId);
 setMsg('Guardado'); setTimeout(function() { setMsg(''); }, 2500);
 }

 async function enviar() {
 if (bloqueado) return;
 // Validar que todas las competencias tienen puntaje y comentario
 var compsSinComentario = competencias.filter(function(c) { return !comentarios[c.id] || !comentarios[c.id].trim(); });
 if (compsSinComentario.length > 0) { setMsg('Todos los comentarios de competencias son obligatorios. Falta: ' + compsSinComentario.map(function(c) { return c.nombre; }).join(', ')); setTimeout(function() { setMsg(''); }, 4000); return; }
 if (!comFin || !comFin.trim()) { setMsg('Los comentarios finales son obligatorios antes de enviar'); setTimeout(function() { setMsg(''); }, 3000); return; }
 var evId = await obtenerOCrearEvalId();
 if (!evId) { setMsg('Error al enviar'); return; }
 setMsg('Enviando...');
 var prom = calcularRating(ratings);
 await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
 await guardarPuntuacionesLider(evId);
 var { error: envErr } = await supabase.from('evaluaciones').update({ estado: 'enviado' }).eq('id', evId);
 if (envErr) { setMsg('Error al enviar: ' + envErr.message); return; }
 setEvalData(function(prev) { return { ...prev, estado: 'enviado' }; });
 setEnviada(true);
 setMsg('Evaluacion enviada correctamente');
 }



 return (
 <div style={{ maxWidth: 960, width: "100%", overflow: "hidden" }}>
 <button onClick={onVolver} style={{ ...s.btnInfo, marginBottom: 16 }}>Volver</button>
 <h3 style={{ color: '#231F20', margin: '0 0 4px 0' }}>Evaluando a: {colaborador.full_name || colaborador.email}</h3>
 <p style={{ color: "#64748b", marginBottom: 20 }}>{[colaborador.puesto, colaborador.area, colaborador.seniority].filter(Boolean).join(" · ")}</p>

 {yaEnviada && (
 <div style={{ padding: 14, background: '#dcfce7', border: '2px solid #166534', borderRadius: 10, marginBottom: 20, textAlign: 'center' }}>
 <strong style={{ color: '#166534', fontSize: 15 }}>Evaluacion enviada. No se puede modificar.</strong>
 </div>
 )}

 {/* Resumen autoevaluacion — solo rating y estado, SIN comentarios finales */}
 {autoEval && (
 <div style={{ background: '#F0EDE8', border: '1px solid #e8e6e0', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontWeight: 600, color: '#231F20', fontSize: 14 }}>Autoevaluacion del colaborador</span>
 <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
 <span style={{ fontSize: 12, color: autoEval.estado === 'enviado' ? '#166534' : '#92400e', fontWeight: 600 }}>
 {autoEval.estado === 'enviado' ? 'Enviada' : 'Borrador'}
 </span>
 {autoEval.rating_promedio && (
 <span style={{ background: '#231F20', color: '#D4D2C6', padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 18 }}>
 {autoEval.rating_promedio}
 </span>
 )}
 </div>
 </div>
 )}

 {/* Competencias */}
 {competencias.map(function(comp) {
 var autoData = autoPuntsMap[comp.id] || null;
 return (
 <div key={comp.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>

 {/* Cabecera con nombre y descripcion */}
 <div style={{ background: '#D4D2C6', padding: '12px 16px' }}>
 <h5 style={{ margin: '0 0 4px 0', color: '#231F20', fontSize: 15 }}>{comp.nombre}</h5>
 {comp.descripcion && <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{comp.descripcion}</p>}
 </div>

 {/* Niveles desplegables */}
 <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
 <button
 onClick={function() { setShowInfo({ ...showInfo, [comp.id]: !showInfo[comp.id] }); }}
 style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
 {showInfo[comp.id] ? '▲ Ocultar niveles' : '▼ Ver niveles de desempeño'}
 </button>
 {showInfo[comp.id] && (
 <div style={{ padding: '0 16px 12px' }}>
 {[1,2,3,4,5].map(function(r) {
 return (
 <div key={r} style={{ padding: '6px 10px', marginBottom: 3, borderRadius: 4, fontSize: 13, color: '#475569', background: 'white', border: '1px solid #e2e8f0' }}>
 <strong>Nivel {r}:</strong> <RatingDesc competenciaId={comp.id} rating={r} />
 </div>
 );
 })}
 </div>
 )}
 </div>


 {/* Layout: auto arriba (readonly), lider abajo (editable) */}
 <div style={{ padding: 16, overflow: 'hidden' }}>

 {/* Autoevaluacion del colaborador — solo lectura */}
 <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14, overflow: 'hidden', wordBreak: 'break-word' }}>
 <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
 Autoevaluacion del colaborador
 </p>
 {autoData ? (
 <div>
 <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
 {[1,2,3,4,5].map(function(r) {
 return (
 <div key={r} style={{
 width: 38, height: 38, borderRadius: 8,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 fontSize: 16, fontWeight: 700,
 background: autoData.rating === r ? '#231F20' : '#e2e8f0',
 color: autoData.rating === r ? '#D4D2C6' : '#94a3b8'
 }}>{r}</div>
 );
 })}
 </div>
 <div style={{ fontSize: 13, color: "#475569", fontStyle: autoData.comentario ? "normal" : "italic", wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap" }}>
 {autoData.comentario || 'Sin comentario'}
 </div>
 </div>
 ) : (
 <p style={{ fontSize: 13, color: '#92400e', fontStyle: 'italic', margin: 0 }}>
 El colaborador aun no completo esta competencia
 </p>
 )}
 </div>

 {/* Evaluacion del lider — editable */}
 <div style={{ background: '#fff', border: '2px solid #D4D2C6', borderRadius: 10, padding: 14 }}>
 <p style={{ fontSize: 11, fontWeight: 700, color: '#231F20', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
 Tu evaluacion
 </p>
 <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
 {[1,2,3,4,5].map(function(r) {
 return (
 <button key={r}
 onClick={function() { if (!bloqueado) setRatings({ ...ratings, [comp.id]: r }); }}
 style={{
 width: 42, height: 42, borderRadius: 8, border: '2px solid',
 borderColor: ratings[comp.id] === r ? '#231F20' : '#e2e8f0',
 fontSize: 18, fontWeight: 700, cursor: bloqueado ? "default" : "pointer",
 background: ratings[comp.id] === r ? '#231F20' : '#f8fafc',
 color: ratings[comp.id] === r ? 'white' : '#475569'
 }}>
 {r}
 </button>
 );
 })}
 </div>
 <textarea
 value={comentarios[comp.id] || ''}
 onChange={function(e) { if (!bloqueado) setComent({ ...comentarios, [comp.id]: e.target.value }); }}
 placeholder="Escribe tu comentario sobre esta competencia..."
 style={{ ...s.textareaSmall, minHeight: 70, background: bloqueado ? "#f8fafc" : "#fff", width: "100%", boxSizing: "border-box" }}
 readOnly={bloqueado}
 />
 </div>

 </div>
 </div>
 );
 })}


 {/* Rating en tiempo real */}
 <RatingFinalBadge ratings={ratings} />

 {/* Comentarios finales — AL FINAL */}
 <div style={{ marginTop: 8, marginBottom: 20 }}>
 <h4 style={s.seccionTitulo}>Comentarios Finales del Lider</h4>
 <textarea
 value={comFin}
 onChange={function(e) { if (!bloqueado) setComFin(e.target.value); }}
 placeholder="Resumen general de la evaluacion, fortalezas y areas de mejora..."
 style={{ ...s.textarea, minHeight: 120 }}
 disabled={bloqueado}
 readOnly={bloqueado}
 />
 </div>

 {/* Comentarios finales de la autoevaluacion — AL FINAL tambien */}
 {autoEval?.comentarios_finales && (
 <div style={{ marginBottom: 20, padding: 16, background: "#F0EDE8", border: "1px solid #e8e6e0", borderRadius: 10, overflow: "hidden" }}>
 <h4 style={{ margin: '0 0 8px 0', color: '#231F20', fontSize: 14 }}>Comentarios finales del colaborador</h4>
 <p style={{ margin: 0, fontSize: 13, color: "#475569", wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{autoEval.comentarios_finales}</p>
 </div>
 )}

 {msg && <div style={s.mensajeToast}>{msg}</div>}

 {!bloqueado && (
 <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
 <button onClick={enviar} style={s.btnPrimario}>Enviar evaluacion</button>
 </div>
 )}
 </div>
 );
}

// =============================================
// PANEL COLABORADOR — con bloqueo post-envío
// =============================================
function PanelColaborador({ userId, seniority, puesto, cicloId, soloLectura }) {
 var [competencias, setComp] = useState([]);
 var [ratings, setRatings] = useState({});
 var [comentarios, setComent] = useState({});
 var [comFin, setComFin] = useState('');
 var [msg, setMsg] = useState('');
 var [carg, setCarg] = useState(true);
 var [evalLider, setEvalLider] = useState(null);
 var [feedback, setFeedback] = useState(null);
 var [confirmandoFb, setConfirmandoFb] = useState(false);
 var [evalData, setEvalData] = useState(null);
 var [showInfo, setShowInfo] = useState({});
 // CAMBIO 4: estados para ver la evaluación del líder
 var [verEvalLider, setVerEvalLider] = useState(false);
 var [evalLiderDetalle, setEvalLiderDetalle] = useState(null);
 var [evalLiderPunts, setEvalLiderPunts] = useState({});

 useEffect(function() {
 (async function() {
 var [{ data: comps }, { data: ev }, { data: le }, { data: fbFilas }] = await Promise.all([
 supabase.from('competencias').select('id, nombre, descripcion').eq('aplica_a', seniority || 'Analista'),
 supabase.from('evaluaciones').select('id, estado, rating_promedio, comentarios_finales').eq('colaborador_id', userId).eq('tipo_evaluacion', 'autoevaluacion').eq('ciclo_id', cicloId).maybeSingle(),
 // CAMBIO 4: traer también comentarios_finales, estado y el flag de aprobación del líder
 supabase.from('evaluaciones').select('id, rating_calibrado, comentario_calibracion, estado, rating_promedio, comentarios_finales, aprobado_lider').eq('colaborador_id', userId).eq('tipo_evaluacion', 'evaluacion_lider').eq('ciclo_id', cicloId).maybeSingle(),
 // No usamos maybeSingle(): si hay filas de feedback duplicadas por datos viejos, maybeSingle() tira error y se pierde el feedback
 supabase.from('feedback').select('*').eq('ciclo_id', cicloId).eq('colaborador_id', userId).order('created_at', { ascending: false })
 ]);
 var fb = (fbFilas && fbFilas.length > 0) ? (fbFilas.find(function(f) { return f.comentario_lider; }) || fbFilas[0]) : null;
 setComp(comps || []);
 setEvalLider(le);
 setFeedback(fb);
 if (ev) {
 setEvalData(ev);
 setComFin(ev.comentarios_finales || '');
 var { data: punts } = await supabase.from('puntuaciones').select('rating, competencia_id, comentario').eq('evaluacion_id', ev.id);
 var rm = {}; var cm = {};
 (punts || []).forEach(function(p) { rm[p.competencia_id] = p.rating; cm[p.competencia_id] = p.comentario || ''; });
 setRatings(rm); setComent(cm);
 } else if (!soloLectura) {
 var { data: nuevo } = await supabase.from('evaluaciones').insert({ colaborador_id: userId, evaluador_id: userId, tipo_evaluacion: 'autoevaluacion', estado: 'borrador', ciclo_id: cicloId }).select('id').single();
 if (nuevo) setEvalData(nuevo);
 }
 setCarg(false);
 })();
 }, []);

 // BORRADOR AUTOMÁTICO
 useEffect(function() {
   if (!evalData?.id || soloLectura || evalData?.estado === 'enviado') return;
   var timer = setTimeout(async function() {
     var evId = evalData.id;
     var prom = calcularRating(ratings);
     await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
     for (var cid of Object.keys(ratings)) {
       var r = ratings[cid]; if (!r) continue;
       var { data: ex } = await supabase.from('puntuaciones').select('id').eq('evaluacion_id', evId).eq('competencia_id', cid).maybeSingle();
       if (ex?.id) { await supabase.from('puntuaciones').update({ rating: r, comentario: comentarios[cid] || '' }).eq('id', ex.id); }
       else { await supabase.from('puntuaciones').insert({ evaluacion_id: evId, competencia_id: cid, rating: r, comentario: comentarios[cid] || '' }); }
     }
   }, 1500);
   return function() { clearTimeout(timer); };
 }, [ratings, comentarios, comFin, evalData?.id]);

 // CAMBIO 4: carga el detalle de la evaluación del líder (puntuaciones + comentarios)
 // Solo si el líder ya dio el OK explícito (aprobado_lider) — antes de eso el colaborador no debe verla
 async function cargarEvalLiderDetalle() {
   if (!evalLider?.id || !evalLider?.aprobado_lider) return;
   var { data: punts } = await supabase
     .from('puntuaciones')
     .select('rating, competencia_id, comentario, competencias(nombre)')
     .eq('evaluacion_id', evalLider.id);
   var map = {};
   (punts || []).forEach(function(p) {
     map[p.competencia_id] = {
       rating: p.rating,
       comentario: p.comentario || '',
       nombre: p.competencias?.nombre || ''
     };
   });
   setEvalLiderDetalle(evalLider);
   setEvalLiderPunts(map);
   setVerEvalLider(true);
 }

 // El colaborador confirma que leyó/recibió el feedback de su líder
 async function confirmarFeedback() {
   if (!feedback?.id) return;
   setConfirmandoFb(true);
   var { data, error } = await supabase
     .from('feedback')
     .update({ confirmacion_colaborador: true })
     .eq('id', feedback.id)
     .select()
     .single();
   if (error) {
     console.error('Error confirmando feedback:', error);
     alert('No se pudo confirmar el feedback: ' + error.message);
   } else {
     setFeedback(data);
   }
   setConfirmandoFb(false);
 }

 var yaEnviada = evalData?.estado === 'enviado';
 var bloqueado = soloLectura || yaEnviada;

 async function guardarPuntuaciones(evId) {
 for (var cid of Object.keys(ratings)) {
 var r = ratings[cid];
 if (!r) continue;
 var { data: ex } = await supabase.from('puntuaciones')
 .select('id').eq('evaluacion_id', evId).eq('competencia_id', cid).maybeSingle();
 if (ex?.id) {
 await supabase.from('puntuaciones')
 .update({ rating: r, comentario: comentarios[cid] || '' }).eq('id', ex.id);
 } else {
 await supabase.from('puntuaciones')
 .insert({ evaluacion_id: evId, competencia_id: cid, rating: r, comentario: comentarios[cid] || '' });
 }
 }
 }

 async function guardar() {
 if (bloqueado) return;
 var evId = evalData?.id;
 if (!evId) { setMsg('Error: no se encontro la evaluacion'); return; }
 if (Object.keys(ratings).length === 0) { setMsg('Selecciona al menos un puntaje'); setTimeout(function() { setMsg(''); }, 2500); return; }
 setMsg('Guardando...');
 var prom = calcularRating(ratings);
 await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
 await guardarPuntuaciones(evId);
 setMsg('Guardado correctamente'); setTimeout(function() { setMsg(''); }, 2500);
 }

 async function enviar() {
 if (bloqueado) return;
 var evId = evalData?.id;
 if (!evId) { setMsg('Error: no se encontro la evaluacion'); return; }
 if (Object.keys(ratings).length === 0) { setMsg('Completa al menos una competencia antes de enviar'); return; }
 // Validar que todas las competencias tienen puntaje y comentario
 var compsSinPuntaje = competencias.filter(function(c) { return !ratings[c.id]; });
 if (compsSinPuntaje.length > 0) { setMsg('Todos los puntajes son obligatorios. Falta: ' + compsSinPuntaje.map(function(c) { return c.nombre; }).join(', ')); setTimeout(function() { setMsg(''); }, 4000); return; }
 var compsSinComentario = competencias.filter(function(c) { return !comentarios[c.id] || !comentarios[c.id].trim(); });
 if (compsSinComentario.length > 0) { setMsg('Todos los comentarios de competencias son obligatorios. Falta: ' + compsSinComentario.map(function(c) { return c.nombre; }).join(', ')); setTimeout(function() { setMsg(''); }, 4000); return; }
 if (!comFin || !comFin.trim()) { setMsg('Los comentarios finales son obligatorios antes de enviar'); setTimeout(function() { setMsg(''); }, 3000); return; }
 setMsg('Enviando...');
 var prom = calcularRating(ratings);
 await supabase.from('evaluaciones').update({ comentarios_finales: comFin, rating_promedio: prom }).eq('id', evId);
 await guardarPuntuaciones(evId);
 var { error: envErr } = await supabase.from('evaluaciones').update({ estado: 'enviado' }).eq('id', evId);
 if (envErr) { setMsg('Error al enviar: ' + envErr.message); return; }
 setEvalData(function(prev) { return { ...prev, estado: 'enviado' }; });
 // Notificar al lider
 var { data: perfColabN } = await supabase.from("profiles").select("full_name, leader_id").eq("id", userId).single();
 var { data: perfColabN } = await supabase.from("profiles").select("full_name, leader_id, email").eq("id", userId).single();
 if (perfColabN && perfColabN.leader_id) {
    if (localStorage.getItem("notifsActivas") !== "false") await crearNotificacion(perfColabN.leader_id, "autoevaluacion_enviada", (perfColabN.full_name || "Un colaborador") + " envió su autoevaluación", userId, perfColabN.full_name);
 // Email al lider
 var { data: liderN } = await supabase.from("profiles").select("email, full_name").eq("id", perfColabN.leader_id).single();
    if (localStorage.getItem("notifsActivas") !== "false" && liderN && liderN.email) {
 await enviarEmailNotificacion(
 liderN.email,
 liderN.full_name || "Líder",
 perfColabN.full_name + " envió su autoevaluación",
 (perfColabN.full_name || "Un colaborador") + " acaba de enviar su autoevaluación de desempeño. Ingresá a la plataforma para revisarla y completar tu evaluación."
 );
 }
 }
 setMsg('Autoevaluacion enviada correctamente');
 }


 if (carg) return <p>Cargando...</p>;

 var clasifCal = clasificarRating(parseFloat(evalLider?.rating_calibrado));

 // ── CAMBIO 4: vista de la evaluación del líder ────────────────────────────────
 if (verEvalLider && evalLiderDetalle) {
   var clasifLider = clasificarRating(parseFloat(evalLiderDetalle.rating_calibrado || evalLiderDetalle.rating_promedio));
   return (
     <div style={{ maxWidth: 900, width: "100%", overflow: "hidden" }}>
       <button
         onClick={function() { setVerEvalLider(false); }}
         style={{ ...s.btnInfo, marginBottom: 16 }}
       >
         ← Volver a mi evaluación
       </button>

       <h3 style={{ color: '#231F20', margin: '0 0 20px 0' }}>Evaluación de mi líder</h3>

       {evalLiderDetalle.rating_calibrado && (
         <div style={{ padding: '24px', background: clasifLider?.bg || '#F0EDE8', borderRadius: 12, border: '2px solid ' + (clasifLider?.color || '#231F20'), marginBottom: 24, textAlign: 'center' }}>
           <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 600, color: clasifLider?.color || '#231F20', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
             Rating calibrado final
           </p>
           <p style={{ margin: '0 0 6px 0', fontSize: 52, fontWeight: 800, color: clasifLider?.color || '#231F20', lineHeight: 1 }}>
             {evalLiderDetalle.rating_calibrado}
           </p>
           {clasifLider && (
             <p style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 600, color: clasifLider.color }}>
               {clasifLider.label}
             </p>
           )}
           {evalLiderDetalle.comentario_calibracion && (
             <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#475569', fontStyle: 'italic', background: 'rgba(255,255,255,0.6)', padding: '8px 14px', borderRadius: 8 }}>
               {evalLiderDetalle.comentario_calibracion}
             </p>
           )}
         </div>
       )}

       <div style={{ ...s.tarjetaStat, marginBottom: 20 }}>
         <h4 style={{ margin: '0 0 16px 0', color: '#231F20' }}>Detalle por competencia</h4>
         {Object.keys(evalLiderPunts).length === 0 ? (
           <p style={{ color: '#94a3b8', fontSize: 13 }}>El líder aún no completó las competencias.</p>
         ) : (
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead>
               <tr style={{ background: '#231F20' }}>
                 <th style={{ ...th, color: '#D4D2C6' }}>Competencia</th>
                 <th style={{ ...th, color: '#D4D2C6', textAlign: 'center', width: 80 }}>Puntaje</th>
                 <th style={{ ...th, color: '#D4D2C6' }}>Comentario del líder</th>
               </tr>
             </thead>
             <tbody>
               {Object.entries(evalLiderPunts).map(function(entry, idx) {
                 var compId = entry[0];
                 var data = entry[1];
                 return (
                   <tr key={compId} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                     <td style={{ ...td, fontWeight: 500 }}>{data.nombre || compId}</td>
                     <td style={{ ...td, textAlign: 'center' }}>
                       <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: '#231F20', color: '#D4D2C6', fontSize: 16, fontWeight: 700 }}>
                         {data.rating}
                       </span>
                     </td>
                     <td style={{ ...td, fontSize: 13, color: '#475569', fontStyle: data.comentario ? 'normal' : 'italic' }}>
                       {data.comentario || 'Sin comentario'}
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         )}
       </div>

       {evalLiderDetalle.comentarios_finales && (
         <div style={{ padding: 16, background: '#F0EDE8', border: '1px solid #D4D2C6', borderRadius: 12 }}>
           <h4 style={{ margin: '0 0 10px 0', color: '#231F20', fontSize: 14 }}>Comentarios finales del líder</h4>
           <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
             {evalLiderDetalle.comentarios_finales}
           </p>
         </div>
       )}
     </div>
   );
 }
 // ── FIN CAMBIO 4 ─────────────────────────────────────────────────────────────

 return (
 <div style={{ maxWidth: 900, width: "100%", overflow: "hidden" }}>
 <h3>Mi Autoevaluacion</h3>
 <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>{[puesto, seniority].filter(Boolean).join(" · ") || "Sin cargo definido"}</p>
 {yaEnviada && (
 <div style={{ padding: 14, background: '#dcfce7', border: '2px solid #166534', borderRadius: 10, marginBottom: 20, textAlign: 'center' }}>
 <strong style={{ color: '#166534', fontSize: 15 }}>Autoevaluacion enviada. No se puede modificar.</strong>
 </div>
 )}
 {feedback?.comentario_lider && (
 <div style={{ padding: 16, background: feedback.confirmacion_colaborador ? '#dcfce7' : '#fef3c7', borderRadius: 10, marginBottom: 20 }}>
 <h4 style={{ margin: '0 0 10px 0' }}>Feedback de tu líder</h4>
 <p style={{ margin: '0 0 14px 0', whiteSpace: 'pre-wrap' }}>{feedback.comentario_lider}</p>
 {feedback.confirmacion_colaborador ? (
   <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#166534' }}>✓ Confirmaste que recibiste este feedback</p>
 ) : (
   <button onClick={confirmarFeedback} disabled={confirmandoFb} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#231F20', color: '#D4D2C6', fontSize: 13, fontWeight: 700, cursor: confirmandoFb ? 'default' : 'pointer', opacity: confirmandoFb ? 0.6 : 1 }}>
     {confirmandoFb ? 'Confirmando...' : 'Confirmar recepción del feedback'}
   </button>
 )}
 </div>
 )}
 {evalLider?.rating_calibrado && evalLider?.aprobado_lider && (
 <div style={{ padding: 16, background: clasifCal?.bg || '#D4D2C6', borderRadius: 10, marginBottom: 20, textAlign: 'center', border: '2px solid ' + (clasifCal?.color || '#231F20') }}>
 <p style={{ margin: 0, color: clasifCal?.color || '#231F20', fontWeight: 600 }}>Resultado Final Calibrado</p>
 <p style={{ fontSize: 40, fontWeight: 700, margin: '8px 0', color: clasifCal?.color || '#231F20' }}>{evalLider.rating_calibrado}</p>
 {clasifCal && <p style={{ margin: '0 0 14px 0', fontSize: 14, color: clasifCal.color, fontWeight: 600 }}>{clasifCal.label}</p>}
 {/* CAMBIO 4: botón para ver la evaluación del líder */}
 <button
   onClick={cargarEvalLiderDetalle}
   style={{
     padding: '9px 22px',
     borderRadius: 8,
     border: '2px solid ' + (clasifCal?.color || '#231F20'),
     background: 'transparent',
     color: clasifCal?.color || '#231F20',
     cursor: 'pointer',
     fontSize: 13,
     fontWeight: 600
   }}
 >
   Ver evaluación de mi líder
 </button>
 </div>
 )}
 {competencias.map(function(comp) {
 return (
 <div key={comp.id} style={s.competenciaCard}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <div><h5>{comp.nombre}</h5><p style={{ fontSize: 13, color: '#64748b' }}>{comp.descripcion}</p></div>
 <button onClick={function() { setShowInfo({ ...showInfo, [comp.id]: !showInfo[comp.id] }); }} style={s.btnInfo}>{showInfo[comp.id] ? 'v' : '>'}</button>
 </div>
 {showInfo[comp.id] && (
 <div style={{ ...s.ratingInfoBox, marginTop: 8 }}>
 {[1,2,3,4,5].map(function(r) { return <div key={r} style={s.ratingInfoItem}><strong>Nivel {r}:</strong> <RatingDesc competenciaId={comp.id} rating={r} /></div>; })}
 </div>
 )}
 <div style={s.ratingRow}>
 {[1,2,3,4,5].map(function(r) {
 return (
 <button key={r} onClick={function() { if (!bloqueado) setRatings({ ...ratings, [comp.id]: r }); }}
 style={{ ...s.ratingBtn, backgroundColor: ratings[comp.id] === r ? '#231F20' : '#f1f5f9', color: ratings[comp.id] === r ? 'white' : '#475569', cursor: bloqueado ? 'default' : 'pointer' }}>
 {r}
 </button>
 );
 })}
 </div>
 <textarea
 value={comentarios[comp.id] || ''}
 onChange={function(e) { if (!bloqueado) setComent({ ...comentarios, [comp.id]: e.target.value }); }}
 placeholder="Comentario"
 style={{ ...s.textareaSmall, width: "100%", boxSizing: "border-box", maxWidth: "100%" }}
 readOnly={bloqueado}
 />
 </div>
 );
 })}
 <RatingFinalBadge ratings={ratings} />
 <SeccionText titulo="Comentarios Finales" valor={comFin} onChange={bloqueado ? function() {} : setComFin} disabled={bloqueado} />
 {msg && <div style={s.mensajeToast}>{msg}</div>}
 {!bloqueado && (
 <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
 <button onClick={guardar} style={s.btnSecundario}>Guardar</button>
 <button onClick={enviar} style={s.btnPrimario}>Enviar autoevaluacion</button>
 </div>
 )}
 </div>
 );
}


// =============================================
// OBJETIVOS
// =============================================
function ObjetivosGerente({ profile }) {
 var [equipo, setEquipo] = useState([]);
 var [colaboradorSeleccionado, setColaboradorSeleccionado] = useState(null);
 var [cargando, setCargando] = useState(true);
 var [busqueda, setBusqueda] = useState('');
 var [filtroArea, setFiltroArea] = useState('Todas');

 useEffect(function() { cargarEquipo(); }, []);

 async function cargarEquipo() {
 var { data: { session } } = await supabase.auth.getSession();
 if (!session) return;
 var uid = session.user.id;

 var { data: visibilidad } = await supabase.from('equipo_visibilidad').select('tipo, valor').eq('lider_id', uid);
 var todos = [];

 if (visibilidad && visibilidad.length > 0) {
 var esTodos = visibilidad.some(function(v) { return v.tipo === 'todos'; });
 if (esTodos) {
 var { data: all } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).neq('id', uid).order('full_name');
 todos = all || [];
 } else {
 var areas = visibilidad.filter(function(v) { return v.tipo === 'area'; }).map(function(v) { return v.valor; });
 var usuarios = visibilidad.filter(function(v) { return v.tipo === 'usuario'; }).map(function(v) { return v.valor; });
 if (areas.length > 0) { var { data: pa } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).neq('id', uid).in('area', areas).order('full_name'); todos = todos.concat(pa || []); }
 if (usuarios.length > 0) { var { data: pu } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('activo', true).neq('id', uid).in('id', usuarios); todos = todos.concat(pu || []); }
 var vistos = {}; todos = todos.filter(function(c) { if (vistos[c.id]) return false; vistos[c.id] = true; return true; });
 }
 }

 // Siempre agregar reportes directos (excepto el propio líder)
 var { data: directos } = await supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, leader_id').eq('leader_id', uid).eq('activo', true).neq('id', uid);
 (directos || []).forEach(function(c) { if (!todos.find(function(x) { return x.id === c.id; })) todos.push(c); });
 todos.sort(function(a, b) { return (a.full_name || '').localeCompare(b.full_name || ''); });

 if (todos.length > 0) {
   var idsEquipo = todos.map(function(c) { return c.id; });

   // Filtro 1: solo colaboradores con módulo obj_individual activo
   var { data: modsActivos } = await supabase
     .from('modulos_usuario')
     .select('user_id')
     .in('user_id', idsEquipo)
     .eq('modulo', 'obj_individual')
     .eq('activo', true);
   var idsConModulo = new Set((modsActivos || []).map(function(m) { return m.user_id; }));
   todos = todos.filter(function(c) { return idsConModulo.has(c.id); });

   // Filtro 2: solo colaboradores con al menos un objetivo cargado (no rechazado)
   if (todos.length > 0) {
     var idsConModuloArr = todos.map(function(c) { return c.id; });
     var { data: objsExistentes } = await supabase
       .from('objetivos')
       .select('colaborador_id')
       .in('colaborador_id', idsConModuloArr)
       .neq('status', 'rechazado');
     var idsConObjetivos = new Set((objsExistentes || []).map(function(o) { return o.colaborador_id; }));
     todos = todos.filter(function(c) { return idsConObjetivos.has(c.id); });
   }
 }

 setEquipo(todos);
 setCargando(false);
 }

 if (cargando) return <p style={{ color: '#64748b', padding: 20 }}>Cargando equipo...</p>;
 if (colaboradorSeleccionado) return <GestionObjetivosLider colaborador={colaboradorSeleccionado} profile={profile} onVolver={function() { setColaboradorSeleccionado(null); }} />;

 var areas = ['Todas'].concat([...new Set(equipo.map(function(c) { return c.area; }).filter(Boolean))].sort());
 var equipoFiltrado = equipo.filter(function(c) {
 if (filtroArea !== 'Todas' && c.area !== filtroArea) return false;
 if (busqueda && !(c.full_name || '').toLowerCase().includes(busqueda.toLowerCase()) && !(c.puesto || '').toLowerCase().includes(busqueda.toLowerCase())) return false;
 return true;
 });

 return (
 <div>
 <div style={{ marginBottom: 20 }}>
 <h2 style={{ color: '#231F20', margin: '0 0 4px 0', fontSize: 20, fontWeight: 700 }}>Objetivos de Mi Equipo</h2>
 <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>{equipoFiltrado.length} de {equipo.length} colaboradores</p>
 </div>

 <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
 <input value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }} placeholder="Buscar por nombre o puesto..."
 style={{ flex: 2, minWidth: 200, padding: '9px 14px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', boxSizing: 'border-box' }} />
 <select value={filtroArea} onChange={function(e) { setFiltroArea(e.target.value); }}
 style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', minWidth: 160 }}>
 {areas.map(function(a) { return <option key={a} value={a}>{a === 'Todas' ? 'Todas las áreas' : a}</option>; })}
 </select>
 {(busqueda || filtroArea !== 'Todas') && (
 <button onClick={function() { setBusqueda(''); setFiltroArea('Todas'); }} style={{ ...s.btnInfo, color: '#dc2626', borderColor: '#fca5a5' }}>Limpiar</button>
 )}
 </div>

 {equipoFiltrado.length === 0 ? (
 <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e8e6e0' }}>
 {equipo.length === 0 ? 'Ningún colaborador tiene el módulo activo y objetivos cargados.' : 'Sin resultados.'}
 </div>
 ) : (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
 {equipoFiltrado.map(function(col) {
 var iniciales = (col.full_name || col.email || 'U').split(' ').slice(0,2).map(function(p) { return p[0]; }).join('').toUpperCase();
 var esDirecto = col.leader_id === profile.id;
 return (
 <div key={col.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '3px solid ' + (esDirecto ? '#231F20' : '#D4D2C6'), padding: '16px 18px', cursor: 'pointer' }}
 onClick={function() { setColaboradorSeleccionado(col); }}>
 <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
 <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#231F20', flexShrink: 0 }}>{iniciales}</div>
 <div>
 <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
 <strong style={{ fontSize: 13, color: '#231F20' }}>{col.full_name || col.email}</strong>
 {!esDirecto && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F0EDE8', color: '#64748b', fontWeight: 600 }}>Indirecto</span>}
 </div>
 <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>{col.puesto || col.area}</p>
 </div>
 </div>
 <button style={{ ...s.btnPrimario, width: '100%', fontSize: 12, padding: '8px', textAlign: 'center' }}>Ver Objetivos</button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}


function GestionObjetivosLider({ colaborador, profile, onVolver }) {
 var [objetivos, setObjetivos] = useState([]);
 var [cargando, setCargando] = useState(true);
 var [modalValidarObj, setModalValidarObj] = useState(null); // obj completo
 var [modalValidarAlcance, setModalValidarAlcance] = useState(null); // obj completo
 var [accion, setAccion] = useState('');
 var [comentario, setComentario] = useState('');
 var [alcanceLider, setAlcanceLider] = useState('');
 var [comentValidacion, setComentValidacion] = useState('');
 var [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
 var [formObj, setFormObj] = useState(null);
  var [alcanceAnualColab, setAlcanceAnualColab] = useState(null);
  var [editandoAlcanceAnual, setEditandoAlcanceAnual] = useState(false);
  var [alcanceAnualTemp, setAlcanceAnualTemp] = useState("");
  var [justAlcanceAnual, setJustAlcanceAnual] = useState("");

 var FORM_VACIO = { objetivo: '', corporativo: '', ponderacion: '', alcance_tipo: 'fecha',
 
 alcance_80_descripcion: '', alcance_80_fecha: '', alcance_80_meta: '',
 alcance_100_descripcion: '', alcance_100_fecha: '', alcance_100_meta: '',
 alcance_120_descripcion: '', alcance_120_fecha: '', alcance_120_meta: '' };

  useEffect(function() { cargarObjetivos(); cargarAlcanceAnualColab(); }, []);

 async function cargarObjetivos() {
 var { data } = await supabase.from('objetivos').select('*').eq('colaborador_id', colaborador.id).order('created_at', { ascending: false });
 setObjetivos(data || []); setCargando(false);
 }

  async function cargarAlcanceAnualColab() {
    var { data } = await supabase.from("alcance_anual").select("*").eq("colaborador_id", colaborador.id).is("ciclo_id", null).maybeSingle();
    setAlcanceAnualColab(data || null);
  }

  async function guardarAlcanceAnual() {
    if (!alcanceAnualTemp) return alert("Ingresá el alcance final");
    if (!justAlcanceAnual.trim()) return alert("La justificación es obligatoria");
    var { data: { session } } = await supabase.auth.getSession();
    await supabase.from("alcance_anual").upsert({
      colaborador_id: colaborador.id,
      ciclo_id: null,
      alcance_final: parseFloat(alcanceAnualTemp),
      justificacion_lider: justAlcanceAnual,
      validado_por_lider: true,
      lider_id: session.user.id,
      fecha_validacion: new Date(),
    }, { onConflict: "colaborador_id,ciclo_id" });
    // Registrar en calibracion_historial
    await supabase.from("calibracion_historial").insert({
      colaborador_id: colaborador.id,
      tipo: "comentario",
      comentario: "Alcance anual validado por lider: " + alcanceAnualTemp + "%. Justificacion: " + justAlcanceAnual,
      usuario_id: session.user.id,
      usuario_nombre: session.user.email
    });
    setEditandoAlcanceAnual(false);
    setAlcanceAnualTemp(""); setJustAlcanceAnual("");
    cargarAlcanceAnualColab();
  }

 // Validar objetivo (aprobar definicion o rechazar)
 async function ejecutarValidacionObj() {
 if (!accion) return alert('Selecciona una accion');
 if (!comentario.trim()) return alert('El comentario es obligatorio');
 var nuevoStatus = accion === 'aprobar' ? 'pendiente' : 'rechazado';
 await supabase.from('objetivos').update({
 status: nuevoStatus,
 validado_por_gerente: accion === 'aprobar',
 comentario_lider: comentario,
 comentario_rechazo_lider: accion === 'rechazar' ? comentario : null,
 fecha_validacion: new Date()
 }).eq('id', modalValidarObj.id);
 setModalValidarObj(null); setAccion(''); setComentario('');
 cargarObjetivos();
 }

 // Validar alcance reportado por el colaborador
 async function ejecutarValidacionAlcance() {
 if (!alcanceLider) return alert('Selecciona el alcance validado');
 if (!comentValidacion.trim()) return alert('El comentario es obligatorio');
 var pond = parseFloat(modalValidarAlcance.ponderacion) || 0;
 await supabase.from('objetivos').update({
 status: 'validado',
 validado_por_gerente: true,
 alcance_validado: alcanceLider,
 comentario_validacion_lider: comentValidacion,
 fecha_validacion_lider: new Date(),
 ponderacion_final: pond * parseFloat(alcanceLider) / 100
 }).eq('id', modalValidarAlcance.id);
 setModalValidarAlcance(null); setAlcanceLider(''); setComentValidacion('');
 cargarObjetivos();
 }

 async function guardarNuevoObjetivo(datosForm) {
 var { data: { session } } = await supabase.auth.getSession();
 var datos = {
 objetivo: datosForm.objetivo, corporativo: datosForm.corporativo,
 ponderacion: parseFloat(datosForm.ponderacion), alcance_tipo: datosForm.alcance_tipo,
 
 alcance_80_descripcion: datosForm.alcance_80_descripcion, alcance_80_fecha: datosForm.alcance_80_fecha || null, alcance_80_meta: datosForm.alcance_80_meta,
 alcance_100_descripcion: datosForm.alcance_100_descripcion, alcance_100_fecha: datosForm.alcance_100_fecha || null, alcance_100_meta: datosForm.alcance_100_meta,
 alcance_120_descripcion: datosForm.alcance_120_descripcion, alcance_120_fecha: datosForm.alcance_120_fecha || null, alcance_120_meta: datosForm.alcance_120_meta,
 colaborador_id: colaborador.id, gerente_id: session.user.id, status: "pendiente", leader_id: colaborador.leader_id || null,
 };
 await supabase.from('objetivos').insert(datos);
 setMostrarFormNuevo(false); setFormObj(null); cargarObjetivos();
 }

 // Calcular alcance total ponderado
 var objValidados = objetivos.filter(function(o) { return o.status === 'validado' && o.alcance_validado; });
 var alcanceTotal = null;
 if (objValidados.length > 0) {
 var sumaPond = objValidados.reduce(function(s, o) { return s + parseFloat(o.ponderacion); }, 0);
 var sumaAlc = objValidados.reduce(function(s, o) { return s + parseFloat(o.alcance_validado) * parseFloat(o.ponderacion); }, 0);
 alcanceTotal = sumaPond > 0 ? (sumaAlc / sumaPond).toFixed(1) : null;
 }
 var totalPond = objetivos.filter(function(o) { return o.status !== 'rechazado'; })
 .reduce(function(s, o) { return s + (parseFloat(o.ponderacion) || 0); }, 0);

 if (cargando) return <p>Cargando...</p>;

 var ALCANCES_VALIDAR = [
 { valor: '80', label: '80%', color: '#92400e', bg: '#fef3c7' },
 { valor: '100', label: '100%', color: '#166534', bg: '#dcfce7' },
 { valor: '120', label: '120%', color: '#1e40af', bg: '#dbeafe' },
 ];

 return (
 <div>
 <button onClick={onVolver} style={{ ...s.btnInfo, marginBottom: 16 }}>Volver al equipo</button>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
 <div>
 <h2 style={{ color: '#231F20', margin: '0 0 4px 0' }}>Objetivos — {colaborador.full_name || colaborador.email}</h2>
 <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
 <span style={{ fontSize: 13, color: totalPond === 100 ? '#166534' : '#64748b', fontWeight: 600 }}>
 Ponderacion total: {totalPond.toFixed(0)}% {totalPond === 100 ? '' : ''}
 </span>
 {alcanceTotal && (
 <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '4px 12px', borderRadius: 8 }}>
 Alcance anual: {alcanceTotal}%
 </span>
 )}
 </div>
 </div>
 <button onClick={function() { setFormObj({ ...FORM_VACIO, ponderacion: Math.max(0, 100 - totalPond) }); setMostrarFormNuevo(true); }} style={{ ...s.btnPrimario, background: '#22c55e', fontSize: 13 }}>
 + Agregar objetivo
 </button>
 </div>

 {mostrarFormNuevo && formObj && (
 <FormObjetivo valor={formObj} onChange={setFormObj} objetivos={objetivos} editandoId={null}
 titulo={'Nuevo objetivo para ' + (colaborador.full_name || colaborador.email)}
 onGuardar={guardarNuevoObjetivo}
 onCancelar={function() { setMostrarFormNuevo(false); setFormObj(null); }} />
 )}

 {/* Modal validar definicion de objetivo */}
 {modalValidarObj && (
 <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={function() { setModalValidarObj(null); }}>
 <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 500, width: '90%' }} onClick={function(e) { e.stopPropagation(); }}>
 <h3 style={{ marginTop: 0 }}>Validar definicion de objetivo</h3>
 <p style={{ color: '#64748b', fontSize: 14 }}><strong>{modalValidarObj.objetivo}</strong></p>
 <div style={{ marginBottom: 16 }}>
 <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Accion *</label>
 <div style={{ display: 'flex', gap: 10 }}>
 <button onClick={function() { setAccion('aprobar'); }} style={{ flex: 1, padding: 12, borderRadius: 8, border: '2px solid', borderColor: accion === 'aprobar' ? '#166534' : '#e2e8f0', background: accion === 'aprobar' ? '#dcfce7' : 'white', cursor: 'pointer', fontWeight: 600, color: '#166534' }}>Aprobar</button>
 <button onClick={function() { setAccion('rechazar'); }} style={{ flex: 1, padding: 12, borderRadius: 8, border: '2px solid', borderColor: accion === 'rechazar' ? '#dc2626' : '#e2e8f0', background: accion === 'rechazar' ? '#fee2e2' : 'white', cursor: 'pointer', fontWeight: 600, color: '#dc2626' }}>Rechazar</button>
 </div>
 </div>
 <div style={{ marginBottom: 16 }}>
 <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Comentario *</label>
 <textarea value={comentario} onChange={function(e) { setComentario(e.target.value); }} placeholder="Explicá tu decisión..." style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 8, border: '2px solid #D4D2C6', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
 </div>
 <div style={{ display: 'flex', gap: 12 }}>
 <button onClick={ejecutarValidacionObj} style={{ ...s.btnPrimario, background: accion === 'aprobar' ? '#22c55e' : '#dc2626', flex: 1 }}>Confirmar</button>
 <button onClick={function() { setModalValidarObj(null); setAccion(''); setComentario(''); }} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 )}

 {/* Modal validar alcance reportado */}
 {/* Modal validar alcance reportado */}
 {modalValidarAlcance && (
   <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={function() { setModalValidarAlcance(null); }}>
     <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 560, width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
       <h3 style={{ marginTop: 0, color: '#231F20' }}>Validar alcance</h3>
       <p style={{ fontSize: 14, color: '#231F20', marginBottom: 12 }}><strong>{modalValidarAlcance.objetivo}</strong></p>

       {/* Info del colaborador */}
       <div style={{ background: '#F0EDE8', border: '1px solid #D4D2C6', borderRadius: 8, padding: 12, marginBottom: 20 }}>
         <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Colaborador reportó: {modalValidarAlcance.alcance_completado}%</p>
         {modalValidarAlcance.justificacion_completado && <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#475569' }}>{modalValidarAlcance.justificacion_completado}</p>}
       </div>

       {/* Botones rápidos */}
       <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#231F20' }}>Alcance validado</p>
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
         {[{v:'80',c:'#92400e',bg:'#fef3c7'},{v:'100',c:'#166534',bg:'#dcfce7'},{v:'120',c:'#1e40af',bg:'#dbeafe'}].map(function(a) {
           var sel = alcanceLider === a.v;
           return <button key={a.v} onClick={function() { setAlcanceLider(a.v); }}
             style={{ padding: '12px 8px', borderRadius: 10, cursor: 'pointer', border: '2px solid', borderColor: sel ? a.c : '#e2e8f0', background: sel ? a.bg : 'white', fontWeight: 700, fontSize: 16, color: a.c }}>
             {a.v}%
           </button>;
         })}
       </div>
       {/* Campo libre */}
       <div style={{ marginBottom: 16 }}>
         <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>O escribí un valor personalizado</label>
         <input type="number" min="0" max="200" value={alcanceLider}
           onChange={function(e) { setAlcanceLider(e.target.value); }}
           placeholder="Ej: 90, 110..."
           style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #D4D2C6', fontSize: 15, fontWeight: 700, boxSizing: 'border-box' }} />
       </div>

       {/* Preview total ponderado */}
       {alcanceLider && (function() {
         var objsValidadosSimul = objetivos.filter(function(o) { return o.status === 'validado' && o.alcance_validado && o.id !== modalValidarAlcance.id; });
         objsValidadosSimul = objsValidadosSimul.concat([{ ...modalValidarAlcance, alcance_validado: parseFloat(alcanceLider), status: 'validado' }]);
         var sp = objsValidadosSimul.reduce(function(s,o) { return s + parseFloat(o.ponderacion); }, 0);
         var sa = objsValidadosSimul.reduce(function(s,o) { return s + parseFloat(o.alcance_validado) * parseFloat(o.ponderacion); }, 0);
         var total = sp > 0 ? (sa / sp).toFixed(1) : null;
         return total ? (
           <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
             <p style={{ margin: 0, fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
               Total alcanzado ponderado (simulación): {total}%
             </p>
             <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#3b82f6' }}>Considera todos los objetivos validados</p>
           </div>
         ) : null;
       })()}

       <div style={{ marginBottom: 16 }}>
         <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Comentario de validación</label>
         <textarea value={comentValidacion} onChange={function(e) { setComentValidacion(e.target.value); }}
           placeholder="Opcional — justificá el alcance validado..."
           style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
       </div>
       <div style={{ display: 'flex', gap: 12 }}>
         <button onClick={ejecutarValidacionAlcance} style={{ ...s.btnPrimario, background: '#22c55e', flex: 1 }}>Confirmar validacion</button>
         <button onClick={function() { setModalValidarAlcance(null); setAlcanceLider(''); setComentValidacion(''); }} style={s.btnSecundario}>Cancelar</button>
       </div>
     </div>
   </div>
 )}


 {objetivos.length === 0 ? (
   <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>Sin objetivos cargados.</p>
 ) : (
   <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
     {objetivos.map(function(obj) {
       var CORP_COLORES = ['#2d6a4f','#c2410c','#1d4ed8','#7c3aed','#0e7490','#92400e','#064e3b'];
       function colorCorp(n) { if (!n) return '#64748b'; var idx = Math.abs(n.split('').reduce(function(a,c) { return a + c.charCodeAt(0); }, 0)) % CORP_COLORES.length; return CORP_COLORES[idx]; }
       var color = colorCorp(obj.corporativo);
       var fechaRef = obj.alcance_100_fecha || obj.alcance_80_fecha;
       var statusBg = { validado: '#dcfce7', completado: '#dbeafe', aceptado: '#f1f5f9', rechazado: '#fee2e2', pendiente: '#fef3c7' };
       var statusColor = { validado: '#166534', completado: '#1e40af', aceptado: '#475569', rechazado: '#dc2626', pendiente: '#92400e' };
       return (
         <div key={obj.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '4px solid ' + color, padding: '16px 20px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
               <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
               <span style={{ fontSize: 12, fontWeight: 600, color: color }}>{obj.corporativo || 'Sin categoría'}</span>
             </div>
             <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: statusBg[obj.status] || '#f1f5f9', color: statusColor[obj.status] || '#475569' }}>
               {obj.status ? obj.status.charAt(0).toUpperCase() + obj.status.slice(1) : '-'}
             </span>
           </div>
           <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#231F20', lineHeight: 1.55, wordBreak: 'break-word' }}>{obj.objetivo}</p>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
             <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
               {fechaRef && <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(fechaRef).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
               {obj.alcance_completado && <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>Colaborador reportó: {obj.alcance_completado}%</span>}
               {obj.alcance_validado && <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Alcance validado: {obj.alcance_validado}%</span>}
               {obj.comentario_lider && <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{obj.comentario_lider}</span>}
             </div>
             <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
               <span style={{ fontSize: 24, fontWeight: 800, color: '#231F20' }}>{obj.ponderacion}%</span>
               {obj.status === 'pendiente' && !obj.validado_por_gerente && (
                 <button onClick={function() { setModalValidarObj(obj); setAccion(''); setComentario(''); }}
                   style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                   Revisar
                 </button>
               )}
               {obj.status === 'completado' && (
                 <button onClick={function() { setModalValidarAlcance(obj); setAlcanceLider(''); setComentValidacion(''); }}
                   style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                   Validar alcance
                 </button>
               )}
             </div>
           </div>
           {obj.justificacion_completado && (
             <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1' }}>
               Justificación: {obj.justificacion_completado}
             </div>
           )}
         </div>
       );
     })}
   </div>
 )}

 {/* Alcance Anual del Colaborador */}
 {objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length > 0 && (
   <div style={{ marginTop: 24, background: '#231F20', borderRadius: 14, padding: '20px 24px', color: '#F0EDE8' }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
       <div>
         <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alcance Anual — {colaborador.full_name}</p>
         <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#64748b' }}>
           Promedio de {objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length} objetivos con alcance reportado
         </p>
       </div>
       <div style={{ textAlign: 'right' }}>
         {alcanceAnualColab?.validado_por_lider ? (
           <div>
             <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#86efac' }}>{alcanceAnualColab.alcance_final}%</p>
             <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#86efac' }}>Validado</p>
             {alcanceAnualColab.justificacion_lider && <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{alcanceAnualColab.justificacion_lider}</p>}
           </div>
         ) : (
           <div>
             <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#D4D2C6' }}>
               {(objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).reduce(function(s,o) { return s + parseFloat(o.alcance_completado); }, 0) / objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length).toFixed(1)}%
             </p>
             <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>Calculado — pendiente de validacion</p>
           </div>
         )}
       </div>
     </div>

     {/* Editor del lider */}
     {!editandoAlcanceAnual ? (
       <button onClick={function() {
         setEditandoAlcanceAnual(true);
         setAlcanceAnualTemp(alcanceAnualColab?.alcance_final || (objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).reduce(function(s,o) { return s + parseFloat(o.alcance_completado); }, 0) / objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length).toFixed(1));
         setJustAlcanceAnual(alcanceAnualColab?.justificacion_lider || '');
       }}
         style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(212,210,198,0.4)', background: 'transparent', color: '#D4D2C6', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
         {alcanceAnualColab?.validado_por_lider ? 'Editar validacion' : 'Validar alcance anual'}
       </button>
     ) : (
       <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }}>
         <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
           <label style={{ fontSize: 12, color: '#D4D2C6', fontWeight: 600, whiteSpace: 'nowrap' }}>Alcance final (%)</label>
           <input type="number" min="0" max="200" value={alcanceAnualTemp}
             onChange={function(e) { setAlcanceAnualTemp(e.target.value); }}
             style={{ width: 80, padding: '8px 10px', borderRadius: 6, border: '2px solid #D4D2C6', fontSize: 16, fontWeight: 700, textAlign: 'center', background: 'white', color: '#231F20' }} />
         </div>
         <textarea value={justAlcanceAnual} onChange={function(e) { setJustAlcanceAnual(e.target.value); }}
           placeholder="Justificacion del alcance final (obligatoria)..."
           style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid rgba(212,210,198,0.4)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', color: '#F0EDE8' }} />
         <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
           <button onClick={guardarAlcanceAnual} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Confirmar</button>
           <button onClick={function() { setEditandoAlcanceAnual(false); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(212,210,198,0.4)', background: 'transparent', color: '#D4D2C6', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
         </div>
       </div>
     )}
   </div>
 )}

 </div>
  );
}



// Helper: componente reutilizable de formulario de objetivo
function FormObjetivo({ valor, onChange, objetivos, editandoId, onGuardar, onCancelar, titulo }) {
 var [obj, setObj] = useState(valor || {});

 // Sync si valor cambia desde afuera (al abrir edicion)
 var prevValorRef = useState(null);
 if (prevValorRef[0] !== valor) {
 prevValorRef[1](valor);
 setObj(valor || {});
 }

 function actualizar(nuevo) {
 setObj(nuevo);
 if (onChange) onChange(nuevo);
 }

 var tipoAlcance = obj.alcance_tipo || 'fecha';

 var usada = (objetivos || [])
 .filter(function(o) { return String(o.id) !== String(editandoId) && o.status !== 'rechazado'; })
 .reduce(function(sum, o) { return sum + (parseFloat(o.ponderacion) || 0); }, 0);
 var disponible = 100 - usada;
 var ponderacionOk = parseFloat(obj.ponderacion) <= disponible && parseFloat(obj.ponderacion) > 0;

 var ALCANCES = [
 { key: '80', label: '80% — Parcialmente alcanzado', bg: '#fef3c7', border: '#fcd34d', color: '#92400e' },
 { key: '100', label: '100% — Alcanzado', bg: '#dcfce7', border: '#86efac', color: '#166534' },
 { key: '120', label: '120% — Superado', bg: '#dbeafe', border: '#93c5fd', color: '#1e40af' },
 ];

 return (
 <div style={{ ...s.tarjetaStat, marginBottom: 20, background: '#f8fafc' }}>
 <h4 style={{ marginTop: 0 }}>{titulo || 'Agregar objetivo'}</h4>

 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
 <div style={{ gridColumn: '1 / -1' }}>
 <label style={{ fontSize: 12, fontWeight: 600 }}>Objetivo *</label>
 <input value={obj.objetivo || ''} onChange={function(e) { actualizar({...obj, objetivo: e.target.value}); }}
 placeholder="Describir el objetivo principal..."
 style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6', boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600 }}>Corporativo</label>
 <input value={obj.corporativo || ''} onChange={function(e) { actualizar({...obj, corporativo: e.target.value}); }}
 placeholder="Ej: Ventas, Operaciones..."
 style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6', boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600 }}>Ponderacion (%)</label>
 <input
 type="number" min="1" max={Math.min(100, disponible + (parseFloat(obj.ponderacion) || 0))}
 value={obj.ponderacion || ''}
 onChange={function(e) { actualizar({...obj, ponderacion: parseFloat(e.target.value) || 0}); }}
 style={{ width: '100%', padding: 8, borderRadius: 6, border: '2px solid ' + (ponderacionOk ? '#D4D2C6' : '#dc2626'), boxSizing: 'border-box' }} />
 <p style={{ fontSize: 11, margin: '4px 0 0 0', color: ponderacionOk ? '#64748b' : '#dc2626' }}>
 {ponderacionOk
 ? 'Disponible: ' + disponible.toFixed(0) + '% — Total: ' + (usada + parseFloat(obj.ponderacion || 0)).toFixed(0) + '%'
 : 'Disponible: ' + disponible.toFixed(0) + '%'}
 </p>
 </div>
 </div>

 {/* Toggle tipo de alcance */}
 <div style={{ margin: '16px 0 12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
 <span style={{ fontSize: 13, fontWeight: 600, color: '#231F20' }}>Tipo de medicion:</span>
 <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '2px solid #D4D2C6' }}>
 <button onClick={function() { actualizar({...obj, alcance_tipo: 'fecha'}); }}
 style={{ padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
 background: tipoAlcance === 'fecha' ? '#231F20' : 'white',
 color: tipoAlcance === 'fecha' ? '#D4D2C6' : '#64748b' }}>
 Fecha
 </button>
 <button onClick={function() { actualizar({...obj, alcance_tipo: 'cantidad'}); }}
 style={{ padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
 background: tipoAlcance === 'cantidad' ? '#231F20' : 'white',
 color: tipoAlcance === 'cantidad' ? '#D4D2C6' : '#64748b' }}>
 Cantidad / Descripcion
 </button>
 </div>
 </div>

 {/* Alcances */}
 <h5 style={{ margin: '12px 0 8px 0', color: '#231F20' }}>Definicion de alcances</h5>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 {ALCANCES.map(function(alc) {
 var descKey = 'alcance_' + alc.key + '_descripcion';
 var metaKey = 'alcance_' + alc.key + '_meta';
 var fechaKey = 'alcance_' + alc.key + '_fecha';
 return (
 <div key={alc.key} style={{ background: alc.bg, padding: 12, borderRadius: 8 }}>
 <label style={{ fontSize: 12, fontWeight: 700, color: alc.color }}>{alc.label}</label>
 <input value={obj[descKey] || ''} onChange={function(e) { var u = {}; u[descKey] = e.target.value; actualizar({...obj, ...u}); }}
 placeholder="Descripcion de este nivel"
 style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid ' + alc.border, fontSize: 12, marginTop: 6, boxSizing: 'border-box' }} />
 {tipoAlcance === 'fecha' ? (
 <input type="date" value={obj[fechaKey] || ''} onChange={function(e) { var u = {}; u[fechaKey] = e.target.value; actualizar({...obj, ...u}); }}
 style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid ' + alc.border, fontSize: 12, marginTop: 4, boxSizing: 'border-box' }} />
 ) : (
 <input value={obj[metaKey] || ''} onChange={function(e) { var u = {}; u[metaKey] = e.target.value; actualizar({...obj, ...u}); }}
 placeholder="Ej: 15 unidades, 3 aperturas..."
 style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid ' + alc.border, fontSize: 12, marginTop: 4, boxSizing: 'border-box' }} />
 )}
 </div>
 );
 })}
 </div>

 <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
 <button
 onClick={function() {
 if (!obj.objetivo) return alert('El objetivo es obligatorio');
 var pond = parseFloat(obj.ponderacion) || 0;
 if (pond <= 0) return alert('La ponderacion debe ser mayor a 0');
 var total = usada + pond;
 if (total > 100) return alert('La ponderacion supera el 100%. Disponible: ' + disponible.toFixed(0) + '%');
 onGuardar(obj);
 }}
 style={{ ...s.btnPrimario, background: '#22c55e' }}>
 Guardar Objetivo
 </button>
 <button onClick={onCancelar} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 );
}



function ObjetivosColaborador({ profile }) {
 var [objetivos, setObjetivos] = useState([]);
 var [cargando, setCargando] = useState(true);
 var [mostrarForm, setMostrarForm] = useState(false);
 var [editandoId, setEditandoId] = useState(null);
 var [formObj, setFormObj] = useState(null);
 var [modalCompletar, setModalCompletar] = useState(null);
  var [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  var [alcanceAnual, setAlcanceAnual] = useState(null);
  var [loadingAlcance, setLoadingAlcance] = useState(false);

 var FORM_VACIO = { objetivo: '', corporativo: '', ponderacion: '', alcance_tipo: 'fecha',
 alcance_80_descripcion: '', alcance_80_fecha: '', alcance_80_meta: '',
 alcance_100_descripcion: '', alcance_100_fecha: '', alcance_100_meta: '',
 alcance_120_descripcion: '', alcance_120_fecha: '', alcance_120_meta: '' };

 // Colores por corporativo
 var CORP_COLORES = ['#2d6a4f','#c2410c','#1d4ed8','#7c3aed','#0e7490','#92400e','#064e3b'];
 function colorCorp(nombre) {
 if (!nombre) return '#64748b';
 var idx = Math.abs(nombre.split('').reduce(function(a,c) { return a + c.charCodeAt(0); }, 0)) % CORP_COLORES.length;
 return CORP_COLORES[idx];
 }

 useEffect(function() { cargarObjetivos(); cargarAlcanceAnual(); }, []);

 async function cargarObjetivos() {
 var { data } = await supabase.from('objetivos').select('*').eq('colaborador_id', profile.id).order('created_at', { ascending: false });
 setObjetivos(data || []); setCargando(false);
 }

 function abrirNuevo() {
 var usada = (objetivos || []).filter(function(o) { return o.status !== 'rechazado'; }).reduce(function(sum, o) { return sum + (parseFloat(o.ponderacion) || 0); }, 0);
 setFormObj({ ...FORM_VACIO, ponderacion: Math.min(100 - usada, 25) });
 setEditandoId(null); setMostrarForm(true);
 }

 function abrirEditar(obj) {
 setFormObj({ objetivo: obj.objetivo || '', corporativo: obj.corporativo || '', ponderacion: obj.ponderacion || 0, alcance_tipo: obj.alcance_tipo || 'fecha',
 alcance_80_descripcion: obj.alcance_80_descripcion || '', alcance_80_fecha: obj.alcance_80_fecha || '', alcance_80_meta: obj.alcance_80_meta || '',
 alcance_100_descripcion: obj.alcance_100_descripcion || '', alcance_100_fecha: obj.alcance_100_fecha || '', alcance_100_meta: obj.alcance_100_meta || '',
 alcance_120_descripcion: obj.alcance_120_descripcion || '', alcance_120_fecha: obj.alcance_120_fecha || '', alcance_120_meta: obj.alcance_120_meta || '' });
 setEditandoId(obj.id); setMostrarForm(true);
 }

 async function guardarObjetivo(datosForm) {
 var datos = { objetivo: datosForm.objetivo, corporativo: datosForm.corporativo, ponderacion: parseFloat(datosForm.ponderacion), alcance_tipo: datosForm.alcance_tipo,
 alcance_80_descripcion: datosForm.alcance_80_descripcion, alcance_80_fecha: datosForm.alcance_80_fecha || null, alcance_80_meta: datosForm.alcance_80_meta,
 alcance_100_descripcion: datosForm.alcance_100_descripcion, alcance_100_fecha: datosForm.alcance_100_fecha || null, alcance_100_meta: datosForm.alcance_100_meta,
 alcance_120_descripcion: datosForm.alcance_120_descripcion, alcance_120_fecha: datosForm.alcance_120_fecha || null, alcance_120_meta: datosForm.alcance_120_meta };
 if (editandoId) {
 await supabase.from('objetivos').update({ ...datos, editado_por_colaborador: true, fecha_edicion: new Date() }).eq('id', editandoId);
 } else {
 var { error: insErr } = await supabase.from('objetivos').insert({ ...datos, colaborador_id: profile.id, status: 'pendiente', anio: new Date().getFullYear() });
 if (insErr) { alert('Error al guardar: ' + insErr.message); return; }
 }
 setMostrarForm(false); setFormObj(null); setEditandoId(null); cargarObjetivos();
 }

 async function aceptarObjetivo(objId) {
 await supabase.from('objetivos').update({ status: 'aceptado', confirmado_colaborador: true, fecha_confirmacion: new Date() }).eq('id', objId);
 cargarObjetivos();
 }

 // Stats
  var objetivosFiltradosPorAnio = objetivos.filter(function(o) { return !o.anio || String(o.anio) === String(anioSeleccionado); });
 var objActivos = objetivosFiltradosPorAnio.filter(function(o) { return o.status !== 'rechazado'; });
 var totalPond = objActivos.reduce(function(s, o) { return s + (parseFloat(o.ponderacion) || 0); }, 0);
 var proxVenc = objetivos.filter(function(o) { return o.alcance_100_fecha || o.alcance_80_fecha; }).map(function(o) { return o.alcance_100_fecha || o.alcance_80_fecha; }).sort()[0];
 var objValidados = objetivos.filter(function(o) { return o.status === 'validado' && o.alcance_validado; });
 var alcanceTotal = null;
 if (objValidados.length > 0) {
 var sp = objValidados.reduce(function(s,o) { return s + parseFloat(o.ponderacion); }, 0);
 var sa = objValidados.reduce(function(s,o) { return s + parseFloat(o.alcance_validado) * parseFloat(o.ponderacion); }, 0);
 alcanceTotal = sp > 0 ? (sa / sp).toFixed(1) : null;
 }

 // Barra de ponderación
 var corpGroups = {};
 objActivos.forEach(function(o) {
 var k = o.corporativo || 'Sin categoría';
 if (!corpGroups[k]) corpGroups[k] = 0;
 corpGroups[k] += parseFloat(o.ponderacion) || 0;
 });

 // Iniciales del colaborador
 var iniciales = (profile.full_name || profile.email || 'U').split(' ').slice(0,2).map(function(p) { return p[0]; }).join('').toUpperCase();

 if (cargando) return <p>Cargando...</p>;

 return (
 <div style={{ maxWidth: 960, margin: '0 auto' }}>

 {/* Header oscuro */}
 <div style={{ background: '#231F20', borderRadius: 14, padding: '24px 28px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
 <div style={{ width: 52, height: 52, borderRadius: 10, background: '#D4D2C6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#231F20', flexShrink: 0 }}>
 {iniciales}
 </div>
 <div>
 <h2 style={{ margin: 0, color: '#F0EDE8', fontSize: 22, fontWeight: 700 }}>Objetivos — {profile.full_name || profile.email}</h2>
 <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{profile.area || ''}{profile.area && ' · '}{profile.area && ' · '}ciclo {anioSeleccionado}</p>
 </div>
 </div>
 <button onClick={abrirNuevo} disabled={totalPond >= 100}
 style={{ padding: '10px 20px', borderRadius: 8, border: '2px solid #D4D2C6', background: 'transparent', color: '#D4D2C6', cursor: totalPond >= 100 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: totalPond >= 100 ? 0.5 : 1 }}>
 {totalPond >= 100 ? '100% completado' : '+ Agregar objetivo'}
 </button>
 </div>

      {/* Selector de año */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Año:</span>
        {[2024, 2025, 2026, 2027].map(function(a) {
          return <button key={a} onClick={function() { setAnioSeleccionado(a); }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (anioSeleccionado === a ? "#231F20" : "#e8e6e0"), background: anioSeleccionado === a ? "#231F20" : "white", color: anioSeleccionado === a ? "#F0EDE8" : "#231F20", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {a}
          </button>;
        })}
      </div>
 {/* KPI Cards */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
 <div style={{ background: '#F0EDE8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e0db' }}>
 <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>Ponderación total</p>
 <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: totalPond === 100 ? '#231F20' : '#c2410c' }}>{totalPond.toFixed(0)}%</p>
 </div>
 <div style={{ background: '#F0EDE8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e0db' }}>
 <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>Objetivos activos</p>
 <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#231F20' }}>{objActivos.length}</p>
 </div>
 <div style={{ background: '#F0EDE8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e0db' }}>
 <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>
 {alcanceTotal ? 'Alcance total' : 'Próximo vencimiento'}
 </p>
 <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#231F20' }}>
 {alcanceTotal ? alcanceTotal + '%' : proxVenc ? new Date(proxVenc).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}
 </p>
 </div>
 </div>

 {/* Barra de ponderación por categoría */}
 {objActivos.length > 0 && (
 <div style={{ marginBottom: 24 }}>
 <div style={{ height: 8, borderRadius: 6, overflow: 'hidden', display: 'flex', background: '#e2e8f0' }}>
 {Object.entries(corpGroups).map(function(entry, i) {
 return <div key={i} style={{ width: (entry[1] / 100 * 100) + '%', background: colorCorp(entry[0]), transition: 'width 0.4s' }} />;
 })}
 </div>
 <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
 {Object.entries(corpGroups).map(function(entry, i) {
 return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
 <div style={{ width: 10, height: 10, borderRadius: 2, background: colorCorp(entry[0]) }} />
 {entry[0]} · {entry[1]}%
 </div>;
 })}
 </div>
 </div>
 )}

 {/* Formulario */}
 {mostrarForm && formObj && (
 <FormObjetivo valor={formObj} onChange={setFormObj} objetivos={objetivos} editandoId={editandoId}
 titulo={editandoId ? 'Editar objetivo' : 'Agregar objetivo'}
 onGuardar={guardarObjetivo}
 onCancelar={function() { setMostrarForm(false); setFormObj(null); setEditandoId(null); }} />
 )}

 {modalCompletar && (
 <ModalCompletar todos={objetivos} objetivo={objetivos.find(function(o) { return o.id === modalCompletar; })}
 onConfirmar={completarObjetivo} onCancelar={function() { setModalCompletar(null); }} />
 )}

 {/* Lista de objetivos */}
 {objetivos.length === 0 ? (
 <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: '#F0EDE8', borderRadius: 12 }}>
 No tenés objetivos cargados aún.
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
 {objetivosFiltradosPorAnio.map(function(obj) {
 var color = colorCorp(obj.corporativo);
 var fechaRef = obj.alcance_100_fecha || obj.alcance_80_fecha;
 var statusBg = { validado: '#dcfce7', completado: '#dbeafe', aceptado: '#f1f5f9', rechazado: '#fee2e2', pendiente: '#fef3c7' };
 var statusColor = { validado: '#166534', completado: '#1e40af', aceptado: '#475569', rechazado: '#dc2626', pendiente: '#92400e' };
 return (
 <div key={obj.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '4px solid ' + color, padding: '16px 20px', position: 'relative' }}>
 {/* Header tarjeta */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
 <span style={{ fontSize: 12, fontWeight: 600, color: color }}>{obj.corporativo || 'Sin categoría'}</span>
 </div>
 <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: statusBg[obj.status] || '#f1f5f9', color: statusColor[obj.status] || '#475569' }}>
 {obj.status ? obj.status.charAt(0).toUpperCase() + obj.status.slice(1) : '-'}
 </span>
 </div>

 {/* Texto objetivo */}
 <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#231F20', lineHeight: 1.55, wordBreak: 'break-word' }}>{obj.objetivo}</p>

 {/* Footer */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
 <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
 {fechaRef && <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(fechaRef).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
 {obj.alcance_validado && <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Alcance validado: {obj.alcance_validado}%</span>}
 {obj.comentario_lider && <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{obj.comentario_lider}</span>}
 </div>
 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
 <span style={{ fontSize: 24, fontWeight: 800, color: '#231F20' }}>{obj.ponderacion}%</span>
 {obj.status === 'pendiente' && (
 <>
 <button onClick={function() { abrirEditar(obj); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #D4D2C6', background: 'white', color: '#231F20', cursor: 'pointer', fontSize: 12 }}>Editar</button>
 <button onClick={function() { aceptarObjetivo(obj.id); }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#231F20', color: '#D4D2C6', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Aceptar</button>
 </>
 )}
 {obj.status === 'aceptado' && (
 <>
 <button onClick={function() { abrirEditar(obj); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #D4D2C6', background: 'white', color: '#231F20', cursor: 'pointer', fontSize: 12 }}>Editar</button>
 <button onClick={function() { setModalCompletar(obj.id); }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#231F20', color: '#D4D2C6', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Registrar alcance</button>
 </>
 )}
 </div>
 </div>

 {/* Alcance completado */}
 {obj.alcance_completado && (
 <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1' }}>
 Alcance reportado: {obj.alcance_completado}% — {obj.justificacion_completado}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Alcance Anual */}
 {objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length > 0 && (
   <div style={{ marginTop: 24, background: '#231F20', borderRadius: 14, padding: '20px 24px', color: '#F0EDE8' }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
       <div>
         <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alcance Anual</p>
         <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#64748b' }}>
           Promedio de {objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length} objetivos con alcance reportado
         </p>
       </div>
       <div style={{ textAlign: 'right' }}>
         {alcanceAnual?.validado_por_lider ? (
           <div>
             <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#86efac' }}>{alcanceAnual.alcance_final}%</p>
             <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#86efac' }}>Validado por el lider</p>
           </div>
         ) : (
           <div>
             <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#D4D2C6' }}>
               {(objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).reduce(function(s,o) { return s + parseFloat(o.alcance_completado); }, 0) / objetivos.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; }).length).toFixed(1)}%
             </p>
             <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748b' }}>Pendiente de validacion del lider</p>
           </div>
         )}
         {alcanceAnual?.justificacion_lider && (
           <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{alcanceAnual.justificacion_lider}</p>
         )}
       </div>
     </div>
   </div>
 )}

 </div>
 );

 async function completarObjetivo(objId, alcance, justificacion) {
 await supabase.from('objetivos').update({ status: 'completado', completado_por_colaborador: true, fecha_completado: new Date(), alcance_completado: alcance, justificacion_completado: justificacion }).eq('id', objId);
 // Notificar al lider
 var { data: perfN } = await supabase.from('profiles').select('full_name, leader_id').eq('id', profile.id).single();
 if (perfN && perfN.leader_id) {
    if (localStorage.getItem("notifsActivas") !== "false") await crearNotificacion(perfN.leader_id, "objetivo_completado", (perfN.full_name || "Un colaborador") + " registró el alcance de un objetivo (" + alcance + "%)", profile.id, perfN.full_name);
 // Email al lider
 var { data: liderObj } = await supabase.from('profiles').select('email, full_name').eq('id', perfN.leader_id).single();
    if (localStorage.getItem("notifsActivas") !== "false" && liderObj && liderObj.email) {
 await enviarEmailNotificacion(
 liderObj.email,
 liderObj.full_name || 'Líder',
 perfN.full_name + ' registró el alcance de un objetivo',
 (perfN.full_name || 'Un colaborador') + ' registró el alcance de su objetivo al ' + alcance + '%. Ingresá a la plataforma para revisar y validar el resultado.'
 );
 }
 }
 setModalCompletar(null); cargarObjetivos();
  setModalCompletar(null); 
  // Calcular alcance anual automático
  var objsActualizados = objetivos.map(function(o) { return o.id === objId ? { ...o, alcance_completado: alcance, status: 'completado' } : o; });
  var objsConAlcance = objsActualizados.filter(function(o) { return o.alcance_completado && o.status !== 'rechazado'; });
  if (objsConAlcance.length > 0) {
    var sumaAlcances = objsConAlcance.reduce(function(s, o) { return s + parseFloat(o.alcance_completado); }, 0);
    var alcanceCalc = (sumaAlcances / objsConAlcance.length).toFixed(1);
    // Guardar o actualizar alcance anual (sin ciclo_id — usamos año actual)
    var año = new Date().getFullYear();
    await supabase.from('alcance_anual').upsert({
      colaborador_id: profile.id,
      ciclo_id: null,
      alcance_calculado: parseFloat(alcanceCalc),
      alcance_final: parseFloat(alcanceCalc),
      lider_id: perfN?.leader_id || null,
    }, { onConflict: 'colaborador_id,ciclo_id' });
    setAlcanceAnual({ alcance_calculado: alcanceCalc, alcance_final: alcanceCalc });
  }
  cargarObjetivos();
 }

 async function cargarAlcanceAnual() {
   var { data } = await supabase.from('alcance_anual').select('*').eq('colaborador_id', profile.id).is('ciclo_id', null).maybeSingle();
   setAlcanceAnual(data || null);
 }

}

function ModalCompletar({ objetivo, onConfirmar, onCancelar, todos }) {
 var [alcance, setAlcance] = useState('');
 var [justificacion, setJustificacion] = useState('');
 if (!objetivo) return null;

 var ALCANCES = [
 { valor: '80', label: '80%', sublabel: 'Parcialmente alcanzado', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
 { valor: '100', label: '100%', sublabel: 'Alcanzado', color: '#166534', bg: '#dcfce7', border: '#86efac' },
 { valor: '120', label: '120%', sublabel: 'Superado', color: '#1e40af', bg: '#dbeafe', border: '#93c5fd' },
 ];

 // Mostrar definicion del nivel seleccionado
 var defAlcance = alcance ? (objetivo['alcance_' + alcance + '_descripcion'] || objetivo['alcance_' + alcance + '_meta'] || '') : '';

 return (
 <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={onCancelar}>
 <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 600, width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
 <h3 style={{ marginTop: 0, color: '#231F20' }}>Registrar alcance</h3>
 <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}><strong>{objetivo.objetivo}</strong></p>

 <p style={{ fontSize: 13, fontWeight: 600, color: '#231F20', marginBottom: 10 }}>¿Qué nivel alcanzaste?</p>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
 {ALCANCES.map(function(a) {
 var sel = alcance === a.valor;
 return (
 <button key={a.valor} onClick={function() { setAlcance(a.valor); }}
 style={{
 padding: '14px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
 border: '2px solid ' + (sel ? a.color : a.border),
 background: sel ? a.bg : 'white',
 transition: 'all 0.15s',
 }}>
 <div style={{ fontSize: 22, fontWeight: 800, color: a.color }}>{a.label}</div>
 <div style={{ fontSize: 11, color: a.color, fontWeight: 600 }}>{a.sublabel}</div>
 </button>
 );
 })}
 </div>

 {/* Campo libre para % personalizado */}
 <div style={{ marginBottom: 16 }}>
   <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>O ingresá otro porcentaje</label>
   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
     <input
       type="number" min="0" max="200"
       value={['80','100','120'].includes(alcance) ? '' : alcance}
       onChange={function(e) { setAlcance(e.target.value); }}
       placeholder="Ej: 65, 90, 110..."
       style={{ width: 120, padding: '10px 12px', borderRadius: 8, border: '2px solid #D4D2C6', fontSize: 15, fontWeight: 700, textAlign: 'center' }}
     />
     <span style={{ fontSize: 20, fontWeight: 700, color: '#231F20' }}>%</span>
     {alcance && !['80','100','120'].includes(alcance) && (
       <span style={{ fontSize: 13, color: '#64748b' }}>Valor personalizado seleccionado</span>
     )}
   </div>
 </div>


 {alcance && defAlcance && (
 <div style={{ background: '#f8fafc', border: '1px solid #D4D2C6', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#475569' }}>
 <strong>Definicion del nivel:</strong> {defAlcance}
 </div>
 )}

 <div style={{ marginBottom: 16 }}>
 <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Justificación *</label>
 <textarea value={justificacion} onChange={function(e) { setJustificacion(e.target.value); }}
 placeholder="Explicá el resultado alcanzado, qué hiciste, qué resultados obtuviste..."
 style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 8, border: '2px solid #D4D2C6', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
 </div>

 {/* Alcance anual simulado */}
 {(function() {
   var todosActivos = (todos || []).filter(function(o) { return o.status !== 'rechazado' && o.id !== objetivo.id; });
   var completados = todosActivos.filter(function(o) { return o.alcance_completado; });
   var alcanceActual = parseFloat(alcance) || 0;
   if (!alcanceActual) return null;

   // Suma de alcances de todos los objetivos (completados + el actual)
   var sumAlcances = completados.reduce(function(s, o) { return s + parseFloat(o.alcance_completado); }, 0) + alcanceActual;
   var cantObjetivos = completados.length + 1 + todosActivos.filter(function(o) { return !o.alcance_completado; }).length;
   var alcanceAnual = (sumAlcances / cantObjetivos).toFixed(1);

   // Versión ponderada
   var spond = completados.reduce(function(s,o) { return s + parseFloat(o.ponderacion||0); }, 0) + parseFloat(objetivo.ponderacion||0);
   var sapond = completados.reduce(function(s,o) { return s + parseFloat(o.alcance_completado) * parseFloat(o.ponderacion||0); }, 0) + alcanceActual * parseFloat(objetivo.ponderacion||0);
   var alcancePond = spond > 0 ? (sapond / spond).toFixed(1) : null;

   return (
     <div style={{ background: '#F0EDE8', border: '1px solid #D4D2C6', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
       <p style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alcance anual estimado</p>
       <div style={{ display: 'flex', gap: 24 }}>
         <div>
           <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Promedio simple</p>
           <p style={{ margin: '2px 0 0 0', fontSize: 28, fontWeight: 800, color: '#231F20' }}>{alcanceAnual}%</p>
           <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>Suma de alcances / {cantObjetivos} objetivos</p>
         </div>
         {alcancePond && (
           <div style={{ borderLeft: '1px solid #D4D2C6', paddingLeft: 24 }}>
             <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Promedio ponderado</p>
             <p style={{ margin: '2px 0 0 0', fontSize: 28, fontWeight: 800, color: '#231F20' }}>{alcancePond}%</p>
             <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>Considera la ponderación de cada objetivo</p>
           </div>
         )}
       </div>
     </div>
   );
 })()}


 <div style={{ display: 'flex', gap: 12 }}>
 <button
 onClick={function() {
 if (!alcance) return alert('Seleccioná un nivel de alcance');
 if (!justificacion.trim()) return alert('La justificación es obligatoria');
 onConfirmar(objetivo.id, alcance, justificacion);
 }}
 style={{ ...s.btnPrimario, background: '#22c55e', flex: 1 }}>
 Confirmar alcance
 </button>
 <button onClick={onCancelar} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 );
}

function PanelAdminObjetivos({ profile }) {
 var [objetivos, setObjetivos] = useState([]); var [colaboradores, setColaboradores] = useState([]); var [cargando, setCargando] = useState(true);
 var [nuevoObjetivo, setNuevoObjetivo] = useState(null);
 var [filtroArea, setFiltroArea] = useState('Todas'); var [filtroSeniority, setFiltroSeniority] = useState('Todos');
 var [mostrarForm, setMostrarForm] = useState(false); var [mostrarHistorico, setMostrarHistorico] = useState(false);
 var [colaboradorSeleccionado, setColaboradorSeleccionado] = useState('');
 var [objetivoHistorico, setObjetivoHistorico] = useState({ objetivo: '', corporativo: '', ponderacion: 25, fecha_historica: '', alcance: '', status: 'validado' });
 var [editandoObj, setEditandoObj] = useState(null);
 var [formEditObj, setFormEditObj] = useState(null);
 useEffect(function() { cargarDatos(); }, []);
 async function cargarDatos() { var [{ data: objs }, { data: cols }] = await Promise.all([supabase.from('objetivos').select('*, colaborador:colaborador_id(email, full_name, area, seniority, leader_id, lider:leader_id(full_name, email)), gerente:gerente_id(email, full_name)').order('created_at', { ascending: false }), supabase.from('profiles').select('id, email, full_name, area, seniority').neq('role', 'admin_rrhh').eq('activo', true)]); setObjetivos(objs || []); setColaboradores(cols || []); setCargando(false); }

 function abrirNuevoAdmin() {
 setNuevoObjetivo({ objetivo: '', corporativo: '', ponderacion: '', alcance_tipo: 'fecha',
 alcance_80_descripcion: '', alcance_80_fecha: '', alcance_80_meta: '',
 alcance_100_descripcion: '', alcance_100_fecha: '', alcance_100_meta: '',
 alcance_120_descripcion: '', alcance_120_fecha: '', alcance_120_meta: '' });
 setMostrarForm(true); setMostrarHistorico(false);
 }

 async function agregarObjetivoAdmin(datosForm) {
 if (!colaboradorSeleccionado) return alert('Selecciona un colaborador');
 if (!datosForm || !datosForm.objetivo) return alert('El objetivo es obligatorio');
 if (!datosForm.ponderacion || parseFloat(datosForm.ponderacion) <= 0) return alert('La ponderacion es obligatoria');
 var objsColab = objetivos.filter(function(o) { return o.colaborador_id === colaboradorSeleccionado && o.status !== 'rechazado'; });
 var usada = objsColab.reduce(function(s, o) { return s + (parseFloat(o.ponderacion) || 0); }, 0);
 if (usada + parseFloat(datosForm.ponderacion) > 100) return alert('La ponderacion supera el 100%. Disponible: ' + (100 - usada) + '%');
 var { data: { session } } = await supabase.auth.getSession();
 var { error: insertErr } = await supabase.from('objetivos').insert({
 gerente_id: session.user.id, colaborador_id: colaboradorSeleccionado, status: 'pendiente', anio: new Date().getFullYear(),
 leader_id: (colaboradores.find(function(c) { return c.id === colaboradorSeleccionado; }) || {}).leader_id || null,
 objetivo: datosForm.objetivo, corporativo: datosForm.corporativo,
 ponderacion: parseFloat(datosForm.ponderacion), alcance_tipo: datosForm.alcance_tipo,
 alcance_80_descripcion: datosForm.alcance_80_descripcion, alcance_80_fecha: datosForm.alcance_80_fecha || null, alcance_80_meta: datosForm.alcance_80_meta,
 alcance_100_descripcion: datosForm.alcance_100_descripcion, alcance_100_fecha: datosForm.alcance_100_fecha || null, alcance_100_meta: datosForm.alcance_100_meta,
 alcance_120_descripcion: datosForm.alcance_120_descripcion, alcance_120_fecha: datosForm.alcance_120_fecha || null, alcance_120_meta: datosForm.alcance_120_meta,
 });
 if (insertErr) { alert('Error al guardar objetivo: ' + insertErr.message); return; }
 setNuevoObjetivo(null); setColaboradorSeleccionado(''); setMostrarForm(false); cargarDatos();
 }
 async function agregarHistorico() { if (!colaboradorSeleccionado || !objetivoHistorico.objetivo || !objetivoHistorico.fecha_historica) return alert('Completa todos los campos'); await supabase.from('objetivos').insert({ colaborador_id: colaboradorSeleccionado, objetivo: objetivoHistorico.objetivo, corporativo: objetivoHistorico.corporativo, ponderacion: objetivoHistorico.ponderacion, status: objetivoHistorico.status, es_historico: true, fecha_historica: objetivoHistorico.fecha_historica, alcance_completado: objetivoHistorico.alcance || null, validado_por_gerente: true }); setObjetivoHistorico({ objetivo: '', corporativo: '', ponderacion: 25, fecha_historica: '', alcance: '', status: 'validado' }); setColaboradorSeleccionado(''); setMostrarHistorico(false); cargarDatos(); }

 async function eliminarObjetivo(objId) {
 if (typeof window !== 'undefined' && !window.confirm("¿Eliminar este objetivo? Esta acción no se puede deshacer.")) return;
 await supabase.from("objetivos").delete().eq("id", objId);
 cargarDatos();
 }

 function abrirEdicionObj(obj) {
 setEditandoObj(obj.id);
 setFormEditObj({ objetivo: obj.objetivo || "", corporativo: obj.corporativo || "", ponderacion: obj.ponderacion || 0, status: obj.status || "pendiente", alcance_tipo: obj.alcance_tipo || "fecha", alcance_80_descripcion: obj.alcance_80_descripcion || "", alcance_80_fecha: obj.alcance_80_fecha || "", alcance_80_meta: obj.alcance_80_meta || "", alcance_100_descripcion: obj.alcance_100_descripcion || "", alcance_100_fecha: obj.alcance_100_fecha || "", alcance_100_meta: obj.alcance_100_meta || "", alcance_120_descripcion: obj.alcance_120_descripcion || "", alcance_120_fecha: obj.alcance_120_fecha || "", alcance_120_meta: obj.alcance_120_meta || "" });
 }

 async function guardarEdicionObj() {
 if (!formEditObj.objetivo) return alert("El objetivo es obligatorio");
 await supabase.from("objetivos").update({ objetivo: formEditObj.objetivo, corporativo: formEditObj.corporativo, ponderacion: parseFloat(formEditObj.ponderacion), status: formEditObj.status, alcance_tipo: formEditObj.alcance_tipo, alcance_80_descripcion: formEditObj.alcance_80_descripcion, alcance_80_fecha: formEditObj.alcance_80_fecha || null, alcance_80_meta: formEditObj.alcance_80_meta, alcance_100_descripcion: formEditObj.alcance_100_descripcion, alcance_100_fecha: formEditObj.alcance_100_fecha || null, alcance_100_meta: formEditObj.alcance_100_meta, alcance_120_descripcion: formEditObj.alcance_120_descripcion, alcance_120_fecha: formEditObj.alcance_120_fecha || null, alcance_120_meta: formEditObj.alcance_120_meta }).eq("id", editandoObj);
 setEditandoObj(null); setFormEditObj(null); cargarDatos();
 }

 async function exportarExcel(tipo) {
 var XLSX = await import('xlsx');
 var wb = XLSX.utils.book_new();

 if (tipo === 'objetivos' || tipo === 'ambos') {
 // Agrupar objetivos por colaborador
 var colabsMap = {};
 objetivosFiltrados.forEach(function(obj) {
 var nombre = obj.colaborador?.full_name || obj.colaborador?.email || 'Sin nombre';
 if (!colabsMap[nombre]) colabsMap[nombre] = [];
 colabsMap[nombre].push(obj);
 });
 Object.entries(colabsMap).forEach(function(entry) {
 var nombre = entry[0]; var objs = entry[1];
 var filas = objs.map(function(obj) { return {
 'Objetivo': obj.objetivo || '',
 'Corporativo': obj.corporativo || '',
 'Ponderacion': (obj.ponderacion || 0) + '%',
 'Estado': obj.status || '',
 'Tipo Alcance': obj.alcance_tipo || '',
 'Alcance 80 - Descripcion': obj.alcance_80_descripcion || '',
 'Alcance 80 - Meta/Fecha': obj.alcance_80_fecha || obj.alcance_80_meta || '',
 'Alcance 100 - Descripcion': obj.alcance_100_descripcion || '',
 'Alcance 100 - Meta/Fecha': obj.alcance_100_fecha || obj.alcance_100_meta || '',
 'Alcance 120 - Descripcion': obj.alcance_120_descripcion || '',
 'Alcance 120 - Meta/Fecha': obj.alcance_120_fecha || obj.alcance_120_meta || '',
 'Alcance Reportado': obj.alcance_completado ? obj.alcance_completado + '%' : '',
 'Justificacion Colaborador': obj.justificacion_completado || '',
 'Alcance Validado': obj.alcance_validado ? obj.alcance_validado + '%' : '',
 'Comentario Lider': obj.comentario_lider || '',
 'Comentario Validacion': obj.comentario_validacion_lider || '',
 }; });
 var ws = XLSX.utils.json_to_sheet(filas);
 // Ancho de columnas
 ws['!cols'] = [40,20,12,12,12,30,20,30,20,30,20,16,30,16,20,30].map(function(w) { return { wch: w }; });
 var hojaNombre = nombre.substring(0, 31).replace(/[\\\/\?\*\[\]:]/g, '');
 XLSX.utils.book_append_sheet(wb, ws, hojaNombre);
 });
 }

 if (tipo === 'evaluaciones' || tipo === 'ambos') {
 // Traer evaluaciones frescas con puntuaciones
 var { data: evs } = await supabase.from('evaluaciones')
 .select('*, colaborador:colaborador_id(full_name, email, area, seniority), puntuaciones(rating, comentario, competencias(nombre))')
 .in('tipo_evaluacion', ['autoevaluacion', 'evaluacion_lider']);

 var colabsEvMap = {};
 (evs || []).forEach(function(ev) {
 var nombre = ev.colaborador?.full_name || ev.colaborador?.email || 'Sin nombre';
 if (!colabsEvMap[nombre]) colabsEvMap[nombre] = [];
 colabsEvMap[nombre].push(ev);
 });

 Object.entries(colabsEvMap).forEach(function(entry) {
 var nombre = entry[0]; var evList = entry[1];
 var filas = [];
 evList.forEach(function(ev) {
 (ev.puntuaciones || []).forEach(function(p) {
 filas.push({
 'Tipo': ev.tipo_evaluacion === 'autoevaluacion' ? 'Autoevaluacion' : 'Evaluacion Lider',
 'Estado': ev.estado || '',
 'Competencia': p.competencias?.nombre || '',
 'Rating': p.rating || '',
 'Comentario': p.comentario || '',
 'Rating Promedio': ev.rating_promedio || '',
 'Rating Calibrado': ev.rating_calibrado || '',
 'Comentarios Finales': ev.comentarios_finales || '',
 });
 });
 });
 if (filas.length === 0) filas.push({ 'Tipo': 'Sin evaluaciones', 'Estado': '', 'Competencia': '', 'Rating': '', 'Comentario': '', 'Rating Promedio': '', 'Rating Calibrado': '', 'Comentarios Finales': '' });
 var ws = XLSX.utils.json_to_sheet(filas);
 ws['!cols'] = [18,12,25,8,35,14,14,35].map(function(w) { return { wch: w }; });
 var hojaNombre = ('EV_' + nombre).substring(0, 31).replace(/[\\\/\?\*\[\]:]/g, '');
 XLSX.utils.book_append_sheet(wb, ws, hojaNombre);
 });
 }

 if (wb.SheetNames.length === 0) return alert('No hay datos para exportar');
 var fecha = new Date().toISOString().slice(0, 10);
 XLSX.writeFile(wb, 'Fabric_' + tipo + '_' + fecha + '.xlsx');
 }


 var areas = ['Todas'].concat([...new Set(colaboradores.map(function(c) { return c.area; }).filter(Boolean))]);
 var seniorities = ['Todos'].concat([...new Set(colaboradores.map(function(c) { return c.seniority; }).filter(Boolean))]);
 var objetivosFiltrados = objetivos.filter(function(obj) { if (filtroArea !== 'Todas' && obj.colaborador?.area !== filtroArea) return false; if (filtroSeniority !== 'Todos' && obj.colaborador?.seniority !== filtroSeniority) return false; return true; });
 if (cargando) return <p>Cargando panel admin...</p>;

 // Objetivos del colaborador seleccionado (para calcular ponderacion disponible en FormObjetivo)
 var objsDelColab = colaboradorSeleccionado ? objetivos.filter(function(o) { return o.colaborador_id === colaboradorSeleccionado && o.status !== 'rechazado'; }) : [];

 return (
 <div>
 <h2 style={{ color: '#231F20', marginBottom: 20 }}>Panel Admin - Objetivos</h2>
 <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
 <select value={filtroArea} onChange={function(e) { setFiltroArea(e.target.value); }} style={{ padding: '8px 12px', borderRadius: 6, border: '2px solid #D4D2C6' }}>{areas.map(function(a) { return <option key={a} value={a}>{a === 'Todas' ? 'Todas las Areas' : a}</option>; })}</select>
 <select value={filtroSeniority} onChange={function(e) { setFiltroSeniority(e.target.value); }} style={{ padding: '8px 12px', borderRadius: 6, border: '2px solid #D4D2C6' }}>{seniorities.map(function(s) { return <option key={s} value={s}>{s === 'Todos' ? 'Todos los Seniority' : s}</option>; })}</select>
 <button onClick={function() { abrirNuevoAdmin(); }} style={{ ...s.btnPrimario, background: '#22c55e' }}>Agregar objetivo</button>
 <button onClick={function() { setMostrarHistorico(!mostrarHistorico); setMostrarForm(false); setNuevoObjetivo(null); }} style={{ ...s.btnPrimario, background: '#8b5cf6' }}>Subir Historico</button>
 <div style={{ position: 'relative', display: 'inline-block' }}><button onClick={function() { var m = document.getElementById('export-menu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; }} style={{ ...s.btnSecundario, background: '#22c55e', color: 'white', fontWeight: 600 }}>Exportar Excel</button><div id="export-menu" style={{ display: 'none', position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #D4D2C6', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 200 }}><button onClick={function() { exportarExcel('objetivos'); }} style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>Ver Objetivos (por colaborador)</button><button onClick={function() { exportarExcel('evaluaciones'); }} style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>Evaluaciones por colaborador</button><button onClick={function() { exportarExcel('ambos'); }} style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>Todo junto</button></div></div>
 </div>

 {/* Formulario nuevo objetivo con FormObjetivo */}
 {mostrarForm && (
 <div style={{ ...s.tarjetaStat, marginBottom: 20, background: '#f8fafc' }}>
 <h4 style={{ marginTop: 0 }}>Asignar Objetivo a Colaborador</h4>
 <div style={{ marginBottom: 16 }}>
 <label style={{ fontSize: 12, fontWeight: 600 }}>Colaborador *</label>
 <select value={colaboradorSeleccionado} onChange={function(e) { setColaboradorSeleccionado(e.target.value); }}
 style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #D4D2C6', marginTop: 4 }}>
 <option value="">Seleccionar colaborador...</option>
 {colaboradores.map(function(c) { return <option key={c.id} value={c.id}>{c.full_name || c.email} — {c.area}</option>; })}
 </select>
 </div>
 {colaboradorSeleccionado && nuevoObjetivo && (
 <FormObjetivo
 valor={nuevoObjetivo} onChange={setNuevoObjetivo}
 objetivos={objsDelColab} editandoId={null}
 titulo=""
 onGuardar={agregarObjetivoAdmin}
 onCancelar={function() { setMostrarForm(false); setNuevoObjetivo(null); setColaboradorSeleccionado(''); }}
 />
 )}
 {!colaboradorSeleccionado && (
 <p style={{ color: '#94a3b8', fontSize: 13 }}>Seleccioná un colaborador para continuar.</p>
 )}
 </div>
 )}

 {mostrarHistorico && (
 <div style={{ ...s.tarjetaStat, marginBottom: 20, background: '#f8fafc' }}>
 <h4>Subir Objetivo Historico</h4>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
 <div><label style={{ fontSize: 12 }}>Colaborador *</label><select value={colaboradorSeleccionado} onChange={function(e) { setColaboradorSeleccionado(e.target.value); }} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6' }}><option value="">Seleccionar...</option>{colaboradores.map(function(c) { return <option key={c.id} value={c.id}>{c.full_name || c.email} - {c.area}</option>; })}</select></div>
 <div><label style={{ fontSize: 12 }}>Objetivo *</label><input value={objetivoHistorico.objetivo} onChange={function(e) { setObjetivoHistorico({...objetivoHistorico, objetivo: e.target.value}); }} placeholder="Describir..." style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6' }} /></div>
 <div><label style={{ fontSize: 12 }}>Fecha Historica *</label><input type="date" value={objetivoHistorico.fecha_historica} onChange={function(e) { setObjetivoHistorico({...objetivoHistorico, fecha_historica: e.target.value}); }} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6' }} /></div>
 <div><label style={{ fontSize: 12 }}>Alcance</label><select value={objetivoHistorico.alcance} onChange={function(e) { setObjetivoHistorico({...objetivoHistorico, alcance: e.target.value}); }} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6' }}><option value="">-</option><option value="0%">0%</option><option value="80%">80%</option><option value="100%">100%</option><option value="120%">120%</option></select></div>
 <div><label style={{ fontSize: 12 }}>Ponderacion (%)</label><select value={objetivoHistorico.ponderacion} onChange={function(e) { setObjetivoHistorico({...objetivoHistorico, ponderacion: parseFloat(e.target.value)}); }} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D4D2C6' }}><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option><option value="25">25%</option><option value="30">30%</option><option value="35">35%</option><option value="40">40%</option><option value="50">50%</option></select></div>
 </div>
 <button onClick={agregarHistorico} style={{ ...s.btnPrimario, background: '#8b5cf6', marginTop: 12 }}>Guardar Historico</button>
 </div>
 )}
 {/* Modal editar objetivo */}
 {editandoObj && formEditObj && (
 <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={function() { setEditandoObj(null); }}>
 <div style={{ background: "white", borderRadius: 16, padding: 28, maxWidth: 560, width: "90%", maxHeight: "85vh", overflowY: "auto" }} onClick={function(e) { e.stopPropagation(); }}>
 <h3 style={{ margin: "0 0 20px 0", color: "#231F20" }}>Editar Objetivo</h3>
 <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
 <div><label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Objetivo *</label><textarea value={formEditObj.objetivo} onChange={function(e) { setFormEditObj({...formEditObj, objetivo: e.target.value}); }} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #D4D2C6", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical", boxSizing: "border-box" }} /></div>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
 <div><label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Corporativo</label><input value={formEditObj.corporativo} onChange={function(e) { setFormEditObj({...formEditObj, corporativo: e.target.value}); }} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #D4D2C6", fontSize: 13, boxSizing: "border-box" }} /></div>
 <div><label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Ponderación (%)</label><input type="number" value={formEditObj.ponderacion} onChange={function(e) { setFormEditObj({...formEditObj, ponderacion: e.target.value}); }} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #D4D2C6", fontSize: 13, boxSizing: "border-box" }} /></div>
 </div>
 <div><label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Status</label><select value={formEditObj.status} onChange={function(e) { setFormEditObj({...formEditObj, status: e.target.value}); }} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #D4D2C6", fontSize: 13 }}><option value="pendiente">Pendiente</option><option value="aceptado">Aceptado</option><option value="completado">Completado</option><option value="validado">Validado</option><option value="rechazado">Rechazado</option></select></div>
 </div>
 <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
 <button onClick={guardarEdicionObj} style={{ ...s.btnPrimario, flex: 1 }}>Guardar cambios</button>
 <button onClick={function() { setEditandoObj(null); }} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 )}
 {objetivosFiltrados.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>No hay objetivos registrados.</p> : (

 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
 <thead><tr style={{ background: '#231F20' }}><th style={{ ...th, color: '#D4D2C6' }}>Colaborador</th><th style={{ ...th, color: '#D4D2C6' }}>Area</th><th style={{ ...th, color: '#D4D2C6' }}>Seniority</th><th style={{ ...th, color: "#D4D2C6" }}>Lider</th><th style={{ ...th, color: '#D4D2C6' }}>Objetivo</th><th style={{ ...th, color: '#D4D2C6' }}>Pond.</th><th style={{ ...th, color: '#D4D2C6' }}>Status</th><th style={{ ...th, color: '#D4D2C6' }}>Alcance</th><th style={{ ...th, color: '#D4D2C6' }}>Historico</th><th style={{ ...th, color: '#D4D2C6' }}>Acciones</th></tr></thead>
 <tbody>{objetivosFiltrados.map(function(obj) { return (
 <tr key={obj.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
 <td style={td}><strong>{obj.colaborador?.full_name || '-'}</strong></td>
 <td style={td}>{obj.colaborador?.area || '-'}</td>
 <td style={td}>{obj.colaborador?.seniority || '-'}</td>
 <td style={td}>{obj.colaborador?.lider?.full_name || obj.colaborador?.lider?.email || '-'}</td>
 <td style={td}>{obj.objetivo}</td>
 <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{obj.ponderacion}%</td>
 <td style={td}><span style={{ padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: obj.status === 'validado' ? '#dcfce7' : obj.status === 'completado' ? '#dbeafe' : '#f1f5f9', color: obj.status === 'validado' ? '#166534' : obj.status === 'completado' ? '#1e40af' : '#64748b' }}>{obj.status}</span></td>
 <td style={td}>{obj.alcance_completado || obj.alcance_validado || '-'}</td>
 <td style={td}>{obj.es_historico ? 'Si' : '-'}</td>
 </tr>
 ); })}</tbody>
 </table>
 </div>
 )}
 </div>
 );
}

function DetalleAutoEvaluacion({ autoevaluacion }) {
 if (!autoevaluacion) return <p style={{ padding: 16, color: '#94a3b8' }}>Sin autoevaluacion.</p>;
 var puntuaciones = autoevaluacion.puntuaciones || [];
 var clasif = clasificarRating(parseFloat(autoevaluacion.rating_promedio));
 return (
 <div style={{ marginTop: 16, background: 'white', borderRadius: 12, border: '2px solid #D4D2C6', overflow: 'hidden', marginBottom: 20 }}>
 <div style={{ background: '#231F20', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
 <h4 style={{ margin: 0, color: '#D4D2C6', fontSize: 16 }}>Autoevaluacion del Colaborador</h4>
 <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
 <span style={{ color: '#D4D2C6', fontSize: 13 }}>{autoevaluacion.estado === 'enviado' ? 'Enviada' : 'Borrador'}</span>
 <div style={{ textAlign: 'center' }}>
 <span style={{ background: clasif?.bg || '#D4D2C6', color: clasif?.color || '#231F20', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 20 }}>{autoevaluacion.rating_promedio || '-'}</span>
 {clasif && <div style={{ fontSize: 10, color: '#D4D2C6', marginTop: 2 }}>{clasif.label}</div>}
 </div>
 </div>
 </div>
 <div style={{ padding: 20 }}>
 {autoevaluacion.comentarios_finales && <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 8 }}><strong>Comentarios Finales:</strong><p style={{ color: '#475569', fontSize: 14, marginTop: 4 }}>{autoevaluacion.comentarios_finales}</p></div>}
 <h5>Calificacion por Competencia</h5>
 {puntuaciones.length === 0 ? <p style={{ color: '#94a3b8' }}>Sin competencias calificadas.</p> : (
 <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
 <thead><tr style={{ background: '#231F20' }}><th style={{ padding: '12px 16px', color: '#D4D2C6', fontSize: 12, textAlign: 'left' }}>Competencia</th><th style={{ padding: '12px 16px', color: '#D4D2C6', fontSize: 12, textAlign: 'center', width: 80 }}>Rating</th><th style={{ padding: '12px 16px', color: '#D4D2C6', fontSize: 12, textAlign: 'left' }}>Comentario</th></tr></thead>
 <tbody>{puntuaciones.map(function(p, i) { return (<tr key={p.id || i} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '12px 16px', fontSize: 14, color: '#231F20', fontWeight: 500 }}>{p.competencias?.nombre || 'ID: ' + p.competencia_id}</td><td style={{ padding: '12px 16px', textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: '#231F20', color: '#D4D2C6', fontSize: 16, fontWeight: 700 }}>{p.rating}</span></td><td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{p.comentario || 'Sin comentario'}</td></tr>); })}</tbody>
 </table>
 )}
 </div>
 </div>
 );
}

function RatingDesc({ competenciaId, rating }) {
 var [desc, setDesc] = useState('...');
 useEffect(function() { (async function() { var { data } = await supabase.from('rating_descriptions').select('titulo, descripcion').eq('competencia_id', competenciaId).eq('rating', rating).single(); if (data) setDesc(data.titulo + ': ' + data.descripcion); })(); }, [competenciaId, rating]);
 return <span>{desc}</span>;
}

function SeccionText({ titulo, valor, onChange, disabled }) {
 return (
 <div style={{ marginBottom: 24 }}>
 <h4 style={s.seccionTitulo}>{titulo}</h4>
 <textarea value={valor} onChange={function(e) { onChange(e.target.value); }} style={{ ...s.textarea }} disabled={disabled} readOnly={disabled} />
 </div>
 );
}



// =============================================
// OBJETIVOS COMPAÑIA — lee de Supabase, editable por admin
// =============================================
// =============================================
// MÓDULO CAPACITACIONES
// =============================================
function ModuloCapacitaciones({ profile, esAdmin }) {
  var [vista, setVista] = useState('lista'); // lista | detalle | nueva
  var [capSeleccionada, setCapSeleccionada] = useState(null);
  var [capacitaciones, setCapacitaciones] = useState([]);
  var [misParticipaciones, setMisParticipaciones] = useState([]);
  var [cargando, setCargando] = useState(true);
  var [form, setForm] = useState({ nombre: '', descripcion: '', fecha: '', duracion_horas: '', instructor: '', url_material: '', tipo: 'interna' });
  var [colabs, setColabs] = useState([]);
  var [participantes, setParticipantes] = useState([]);
  var [seleccionados, setSeleccionados] = useState([]);
  var [busquedaColab, setBusquedaColab] = useState('');
  var [guardando, setGuardando] = useState(false);
  var [editandoMaterial, setEditandoMaterial] = useState(false);
  var [urlMaterialTemp, setUrlMaterialTemp] = useState('');

  useEffect(function() { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    if (esAdmin) {
      var [{ data: caps }, { data: perfiles }] = await Promise.all([
        supabase.from('capacitaciones').select('*, capacitacion_participantes(id, colaborador_id, fecha_completado, aprobado, nota, observaciones, profiles:colaborador_id(full_name, area, puesto))').eq('activo', true).order('fecha', { ascending: false }),
        supabase.from('profiles').select('id, full_name, area, puesto, seniority').eq('activo', true).order('full_name'),
      ]);
      setCapacitaciones(caps || []);
      setColabs(perfiles || []);
    } else {
      // CAMBIO: traer url_material para mostrar botón descargar
      var { data: parts } = await supabase.from('capacitacion_participantes').select('*, capacitacion:capacitacion_id(id, nombre, descripcion, fecha, duracion_horas, instructor, url_material, tipo)').eq('colaborador_id', profile.id);
      setMisParticipaciones(parts || []);
    }
    setCargando(false);
  }

  async function abrirDetalle(cap) {
    setCapSeleccionada(cap);
    setParticipantes(cap.capacitacion_participantes || []);
    setSeleccionados((cap.capacitacion_participantes || []).map(function(p) { return p.colaborador_id; }));
    setEditandoMaterial(false);
    setUrlMaterialTemp(cap.url_material || '');
    setVista('detalle');
  }

  async function guardarCapacitacion() {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    if (!form.fecha) return alert('La fecha es obligatoria');
    setGuardando(true);
    var { data: { session } } = await supabase.auth.getSession();
    var { data: nueva } = await supabase.from('capacitaciones').insert({
      nombre: form.nombre, descripcion: form.descripcion, fecha: form.fecha,
      duracion_horas: form.duracion_horas ? parseFloat(form.duracion_horas) : null,
      instructor: form.instructor,
      url_material: form.url_material || null,
      tipo: form.tipo || 'interna',
      created_by: session.user.id
    }).select().single();
    if (nueva && seleccionados.length > 0) {
      await supabase.from('capacitacion_participantes').insert(
        seleccionados.map(function(cid) { return { capacitacion_id: nueva.id, colaborador_id: cid, fecha_completado: form.fecha }; })
      );
    }
    setForm({ nombre: '', descripcion: '', fecha: '', duracion_horas: '', instructor: '', url_material: '', tipo: 'interna' });
    setSeleccionados([]);
    setGuardando(false);
    setVista('lista');
    cargar();
  }

  async function guardarUrlMaterial() {
    if (!capSeleccionada) return;
    await supabase.from('capacitaciones').update({ url_material: urlMaterialTemp || null }).eq('id', capSeleccionada.id);
    setCapSeleccionada({ ...capSeleccionada, url_material: urlMaterialTemp || null });
    setEditandoMaterial(false);
    cargar();
  }

  async function agregarQuitarParticipante(colabId) {
    if (!capSeleccionada) return;
    var yaEsta = seleccionados.includes(colabId);
    if (yaEsta) {
      await supabase.from('capacitacion_participantes').delete().eq('capacitacion_id', capSeleccionada.id).eq('colaborador_id', colabId);
      setSeleccionados(function(p) { return p.filter(function(id) { return id !== colabId; }); });
    } else {
      await supabase.from('capacitacion_participantes').insert({ capacitacion_id: capSeleccionada.id, colaborador_id: colabId, fecha_completado: capSeleccionada.fecha });
      setSeleccionados(function(p) { return [...p, colabId]; });
    }
    cargar();
  }

  async function eliminarCapacitacion(capId) {
    if (!window.confirm('¿Eliminar esta capacitación? Se eliminarán todos los participantes.')) return;
    await supabase.from('capacitaciones').update({ activo: false }).eq('id', capId);
    cargar();
  }

  function generarCertificadoPDF(part, cap) {
    var capData = cap || part.capacitacion;
    var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var W = 297; var H = 210;

    // Fondo: interna = beige Fabric, externa = blanco
    var esExterna = capData && capData.tipo === 'externa';
    if (esExterna) {
      pdf.setFillColor(255, 255, 255);
    } else {
      pdf.setFillColor(220, 217, 210);
    }
    pdf.rect(0, 0, W, H, 'F');

    pdf.setDrawColor(35, 31, 32);
    pdf.setLineWidth(3);
    pdf.roundedRect(6, 6, W - 12, H - 12, 8, 8, 'S');
    pdf.setLineWidth(0.6);
    pdf.roundedRect(10, 10, W - 20, H - 20, 6, 6, 'S');

    pdf.setDrawColor(140, 130, 115);
    pdf.setLineWidth(0.6);
    pdf.line(W/2 - 65, 30, W/2 - 22, 30);
    pdf.line(W/2 + 22, 30, W/2 + 65, 30);
    try { pdf.addImage('/logo.jpg', 'JPEG', W/2 - 18, 15, 36, 36); } catch(e) {}

    pdf.setFont('times', 'bold');
    pdf.setFontSize(50);
    pdf.setTextColor(25, 22, 20);
    pdf.text('CERTIFICADO', W/2, 64, { align: 'center' });

    pdf.setDrawColor(130, 120, 105);
    pdf.setLineWidth(0.5);
    pdf.line(W/2 - 95, 68, W/2 + 95, 68);

    var nombreColab = '';
    if (part && part.profiles) nombreColab = part.profiles.full_name || '';
    else if (typeof profile !== 'undefined' && profile) nombreColab = profile.full_name || profile.email || '';
    pdf.setFont('times', 'bolditalic');
    pdf.setFontSize(28);
    pdf.setTextColor(35, 31, 32);
    pdf.text(nombreColab, W/2, 86, { align: 'center' });
    pdf.setDrawColor(35, 31, 32);
    pdf.setLineWidth(0.7);
    var nw = Math.min(pdf.getTextWidth(nombreColab) + 16, W - 80);
    pdf.line(W/2 - nw/2, 90, W/2 + nw/2, 90);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(70, 65, 55);
    pdf.text('Se extiende el siguiente certificado por haber completado', W/2, 102, { align: 'center' });
    pdf.text('exitosamente la capacitacion:', W/2, 110, { align: 'center' });

    var nombreCap = (capData && capData.nombre) ? capData.nombre : '';
    pdf.setFont('times', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(25, 22, 20);
    var linesCap = pdf.splitTextToSize(nombreCap, W - 100);
    pdf.text(linesCap, W/2, 121, { align: 'center' });

    var yDet = 121 + linesCap.length * 7 + 3;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 95, 85);
    var detalles = [];
    if (capData && capData.fecha) detalles.push(new Date(capData.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }));
    if (capData && capData.duracion_horas) detalles.push(capData.duracion_horas + ' horas');
    if (capData && capData.instructor) detalles.push('Instructor: ' + capData.instructor);
    if (detalles.length > 0) pdf.text(detalles.join('  ·  '), W/2, yDet, { align: 'center' });

    // Firmas — líneas negras simples, sin imágenes
    var yLinea = H - 34;
    var yNombre = H - 27;
    var yCargo = H - 21;

    pdf.setDrawColor(35, 31, 32); pdf.setLineWidth(0.8);
    try { pdf.addImage('data:image/png;base64,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', 'PNG', W/4 - 20, yFirmaImg, 40, 16); } catch(e) {}
    pdf.line(W/4 - 38, yLinea, W/4 + 38, yLinea);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(35, 31, 32);
    pdf.text('Adrian Galvan', W/4, yNombre, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(70, 65, 55);
    pdf.text('Gerente de Recursos Humanos', W/4, yCargo, { align: 'center' });

    try { pdf.addImage('data:image/jpeg;base64,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LAAILFBBQALAAgqWlQoSWCgSiUEtJFCUWAAAgtzRLBQsAAgoALAigQVCglFALAIiwWUAWCwCUAILLBZVIKgrKNzzptkanlD1hWgMkWhKEBYGdAoSAoBUoWBqBYCBaHmIuitQIEQLBbBNwVBAAJQAlBoICwIDWAQGygigzCtCKKkACiJQQM6ABCtiJA0BCoAC0iUJAaBkGgQM0KCUNBWAUHmHpA8/AjHOGfYPHyCg9BKgf//aAAwDAQACAAMAAAAhvXfvz/zLaa+WueqC6+iK2quGiWCOyy+OLGSuqmayWWu+GymeGivLfPPF1TTDfD/3b3XOeW6HKfHHHD7dD/8Ay+qpqjrnuuorimlstkrokhvrnmsoolli5ukphiqiktopmttkj+4db35y23893qokhkhnpzw449z27z76kj0hp/pnnpupmjtlmoihggusslljnnvjvuhugspprimrsktvwy29eY0/9xginkkhoioi53+7x/2y/wC+9Yb+KZMOO5obqpbIrLIYr77bL557ZK7bYL55aI7qqb56r4ZoI6L4eRMP+JZbrjIq5a4pKZ74LYpb75brcfK7op4qqL64apZIKq46pq4KIqooY4q6LIZbbqJ757Z75IZbbJbrrTMIK5SAb6Kq57LLKIIroIq4YLJp5Ko4K4bYa6ab75ZbKJ4ZKarL6qIp5rqJ7K7pop7rrYI465JKb455DwjTDyjxxi5p4KIpYY7JZY5p7Lb4I4455ZbIYp4oaJbKaYIKo7YaLLroo5LKoaJZ6SqrKLa45I5qIqIQCxLwBQb6o4y45qp65ZqpqKYpY5aoL6YZbJ7abppIbZ7Iqqb7IopaK5aKJpIZZYqrBrrYLob6qIb4ZqBBj64wDShihDBKZ7J44q67aa6aKKoaL7rY7bra7rrLb5IpZIap4Lop68PPduoYJ4L4rY5gSyaYabbZrZChjopYwzyxigzywQZ6qRI4ab64KIYb4574q4r7oI5o747rYKY44pKrodsvs9/7qr4LBzjpaI74rrZbqiCxizjyxigwBiyxhTRgZII44KIbbAC54r557bIaoI6Z56JII5r7ZYYZ7bW/t+3jawj7K6JpJQwTRLK6bwDo5oBjCzTBRwBThyji7YQAwAzqqpJLY5oZY7Z777or6rY555Y4r544BNFN8tCwRprr5qpriziRACBzb4Rra7iBQADg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', 'JPEG', W*3/4 - 24, yFirmaImg, 48, 16); } catch(e) {}
    pdf.setDrawColor(35, 31, 32); pdf.setLineWidth(0.8);
    pdf.line(W*3/4 - 38, yLinea, W*3/4 + 38, yLinea);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(35, 31, 32);
    pdf.text('Florencia Salvaneschi', W*3/4, yNombre, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(70, 65, 55);
    pdf.text('HRBP Operaciones', W*3/4, yCargo, { align: 'center' });

    pdf.save('Certificado_' + (nombreColab || 'colaborador').replace(/\s+/g, '_') + '.pdf');
  }


  var inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  var labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

  if (cargando) return <p style={{ padding: 40, color: '#64748b' }}>Cargando...</p>;

  // ── VISTA COLABORADOR ──
  if (!esAdmin) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ background: '#231F20', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#F0EDE8', fontSize: 22, fontWeight: 700 }}>Mis Capacitaciones</h2>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>{misParticipaciones.length} capacitación{misParticipaciones.length !== 1 ? 'es' : ''} completada{misParticipaciones.length !== 1 ? 's' : ''}</p>
        </div>
        {misParticipaciones.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Todavía no tenés capacitaciones registradas.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {misParticipaciones.map(function(part) {
              var cap = part.capacitacion;
              return (
                <div key={part.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '4px solid #231F20', padding: '16px 20px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#231F20' }}>{cap?.nombre}</p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                      {cap?.fecha && <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(cap.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                      {cap?.duracion_horas && <span style={{ fontSize: 12, color: '#64748b' }}>{cap.duracion_horas} hs</span>}
                      {cap?.instructor && <span style={{ fontSize: 12, color: '#64748b' }}>Instructor: {cap.instructor}</span>}
                    </div>
                    {cap?.descripcion && <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{cap.descripcion}</p>}
                  </div>
                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={function() { generarCertificadoPDF(part, null); }}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#231F20', color: '#F0EDE8', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Descargar Certificado
                    </button>
                    {/* CAMBIO: botón descargar material, solo si tiene url_material */}
                    {cap?.url_material && (
                      <a href={cap.url_material} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '8px 16px', borderRadius: 8, border: '2px solid #231F20', background: 'white', color: '#231F20', cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        ↓ Descargar Material
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── VISTA ADMIN — NUEVA CAPACITACIÓN ──
  if (vista === 'nueva') {
    var colabsFiltrados = colabs.filter(function(c) {
      if (!busquedaColab) return true;
      return (c.full_name || '').toLowerCase().includes(busquedaColab.toLowerCase()) || (c.area || '').toLowerCase().includes(busquedaColab.toLowerCase());
    });
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={function() { setVista('lista'); setSeleccionados([]); }} style={s.btnInfo}>Volver</button>
          <h2 style={{ margin: 0, color: '#231F20', fontSize: 20, fontWeight: 700 }}>Nueva Capacitación</h2>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Formulario */}
          <div style={{ flex: 1, minWidth: 280, background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, color: '#231F20', fontSize: 15 }}>Datos de la capacitación</h3>
            <div><label style={labelStyle}>Nombre *</label><input value={form.nombre} onChange={function(e) { setForm({...form, nombre: e.target.value}); }} style={inputStyle} placeholder="Ej: Escuela de Sushi" /></div>
            <div><label style={labelStyle}>Descripción</label><textarea value={form.descripcion} onChange={function(e) { setForm({...form, descripcion: e.target.value}); }} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Descripción de la capacitación..." /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>Fecha *</label><input type="date" value={form.fecha} onChange={function(e) { setForm({...form, fecha: e.target.value}); }} style={inputStyle} /></div>
              <div><label style={labelStyle}>Duración (horas)</label><input type="number" value={form.duracion_horas} onChange={function(e) { setForm({...form, duracion_horas: e.target.value}); }} style={inputStyle} placeholder="Ej: 8" /></div>
            </div>
            <div><label style={labelStyle}>Instructor</label><input value={form.instructor} onChange={function(e) { setForm({...form, instructor: e.target.value}); }} style={inputStyle} placeholder="Nombre del instructor" /></div>
            {/* Campo tipo: interna o externa */}
            <div>
              <label style={labelStyle}>Tipo de capacitación</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {['interna', 'externa'].map(function(t) {
                  return <button key={t} type="button" onClick={function() { setForm({...form, tipo: t}); }}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: '2px solid', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      borderColor: form.tipo === t ? '#231F20' : '#e8e6e0',
                      background: form.tipo === t ? '#231F20' : 'white',
                      color: form.tipo === t ? '#F0EDE8' : '#64748b' }}>
                    {t === 'interna' ? 'Interna' : 'Externa'}
                  </button>;
                })}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8' }}>Interna: certificado con fondo beige. Externa: fondo blanco.</p>
            </div>
            {/* CAMBIO: campo url_material en el formulario de nueva capacitación */}
            <div>
              <label style={labelStyle}>URL del material (opcional)</label>
              <input value={form.url_material} onChange={function(e) { setForm({...form, url_material: e.target.value}); }} style={inputStyle} placeholder="https://drive.google.com/... o cualquier enlace" />
              <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94a3b8' }}>Si cargás un link, los colaboradores verán el botón "Descargar Material".</p>
            </div>
          </div>

          {/* Selector de participantes */}
          <div style={{ flex: 1, minWidth: 280, background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 24 }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#231F20', fontSize: 15 }}>Participantes ({seleccionados.length})</h3>
            <input value={busquedaColab} onChange={function(e) { setBusquedaColab(e.target.value); }} placeholder="Buscar colaborador o área..." style={{ ...inputStyle, marginBottom: 12 }} />
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {colabsFiltrados.map(function(c) {
                var sel = seleccionados.includes(c.id);
                return (
                  <div key={c.id} onClick={function() { setSeleccionados(function(p) { return sel ? p.filter(function(id) { return id !== c.id; }) : [...p, c.id]; }); }}
                    style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: sel ? '#231F20' : '#F0EDE8', border: '1px solid ' + (sel ? '#231F20' : '#e8e6e0') }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: sel ? '#F0EDE8' : '#231F20' }}>{c.full_name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: sel ? '#94a3b8' : '#64748b' }}>{c.area}{c.puesto ? ' · ' + c.puesto : ''}</p>
                    </div>
                    {sel && <span style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={guardarCapacitacion} disabled={guardando} style={{ ...s.btnPrimario, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando...' : 'Guardar capacitación'}</button>
          <button onClick={function() { setVista('lista'); setSeleccionados([]); }} style={s.btnSecundario}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ── VISTA ADMIN — DETALLE ──
  if (vista === 'detalle' && capSeleccionada) {
    var colabsFiltradosD = colabs.filter(function(c) {
      if (!busquedaColab) return true;
      return (c.full_name || '').toLowerCase().includes(busquedaColab.toLowerCase()) || (c.area || '').toLowerCase().includes(busquedaColab.toLowerCase());
    });
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={function() { setVista('lista'); setBusquedaColab(''); cargar(); }} style={s.btnInfo}>Volver</button>
          <h2 style={{ margin: 0, color: '#231F20', fontSize: 20, fontWeight: 700 }}>{capSeleccionada.nombre}</h2>
        </div>
        {/* Info */}
        <div style={{ background: '#231F20', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {capSeleccionada.fecha && <span style={{ fontSize: 13, color: '#D4D2C6' }}>{new Date(capSeleccionada.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
          {capSeleccionada.duracion_horas && <span style={{ fontSize: 13, color: '#D4D2C6' }}>{capSeleccionada.duracion_horas} horas</span>}
          {capSeleccionada.instructor && <span style={{ fontSize: 13, color: '#D4D2C6' }}>Instructor: {capSeleccionada.instructor}</span>}
          <span style={{ fontSize: 13, color: '#86efac', fontWeight: 700 }}>{seleccionados.length} participantes</span>
        </div>

        {/* CAMBIO: sección editar URL material */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editandoMaterial ? 12 : 0 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#231F20' }}>Material de la capacitación</span>
              {!editandoMaterial && capSeleccionada.url_material && (
                <a href={capSeleccionada.url_material} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 12, fontSize: 13, color: '#1e40af', textDecoration: 'underline' }}>
                  Ver material ↗
                </a>
              )}
              {!editandoMaterial && !capSeleccionada.url_material && (
                <span style={{ marginLeft: 12, fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Sin material cargado</span>
              )}
            </div>
            {!editandoMaterial && (
              <button onClick={function() { setEditandoMaterial(true); setUrlMaterialTemp(capSeleccionada.url_material || ''); }}
                style={s.btnInfo}>
                {capSeleccionada.url_material ? 'Editar material' : 'Agregar material'}
              </button>
            )}
          </div>
          {editandoMaterial && (
            <div>
              <input
                value={urlMaterialTemp}
                onChange={function(e) { setUrlMaterialTemp(e.target.value); }}
                placeholder="https://drive.google.com/... o cualquier enlace"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={guardarUrlMaterial} style={s.btnPrimario}>Guardar</button>
                <button onClick={function() { setEditandoMaterial(false); }} style={s.btnInfo}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Lista participantes actuales */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#231F20' }}>Participantes</h4>
            {seleccionados.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 13 }}>Sin participantes aún.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colabs.filter(function(c) { return seleccionados.includes(c.id); }).map(function(c) {
                  return (
                    <div key={c.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e8e6e0', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#231F20' }}>{c.full_name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{c.area}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={function() { var _c = c; var _cap = capSeleccionada; generarCertificadoPDF({ profiles: _c }, _cap); }}
                          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#F0EDE8', color: '#231F20', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          PDF
                        </button>
                        <button onClick={function() { agregarQuitarParticipante(c.id); }}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Agregar participantes */}
          <div style={{ flex: 1, minWidth: 280, background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 20 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#231F20' }}>Agregar participante</h4>
            <input value={busquedaColab} onChange={function(e) { setBusquedaColab(e.target.value); }} placeholder="Buscar..." style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {colabsFiltradosD.filter(function(c) { return !seleccionados.includes(c.id); }).map(function(c) {
                return (
                  <div key={c.id} onClick={function() { agregarQuitarParticipante(c.id); }}
                    style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: '#F0EDE8', border: '1px solid #e8e6e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#231F20' }}>{c.full_name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{c.area}</p>
                    </div>
                    <span style={{ fontSize: 18, color: '#231F20' }}>+</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function exportarExcelCapacitaciones() {
    var rows = [['Capacitación', 'Descripción', 'Fecha', 'Duración (hs)', 'Instructor', 'Cantidad Participantes', 'Participantes']];
    capacitaciones.forEach(function(cap) {
      var parts = (cap.capacitacion_participantes || []);
      var nombres = parts.map(function(p) { return p.profiles ? p.profiles.full_name : ''; }).filter(Boolean).join(', ');
      var fecha = cap.fecha ? new Date(cap.fecha + 'T12:00:00').toLocaleDateString('es-AR') : '';
      rows.push([
        cap.nombre || '',
        cap.descripcion || '',
        fecha,
        cap.duracion_horas || '',
        cap.instructor || '',
        parts.length,
        nombres
      ]);
    });

    // Construir CSV con BOM para Excel
    var bom = '\uFEFF';
    var csv = bom + rows.map(function(row) {
      return row.map(function(cell) {
        var val = String(cell).replace(/"/g, '""');
        return '"' + val + '"';
      }).join(';');
    }).join('\r\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Capacitaciones_Fabric_' + new Date().toLocaleDateString('es-AR').replace(/\//g,'-') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── VISTA ADMIN — LISTA ──
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: '#231F20', fontSize: 22, fontWeight: 700 }}>Capacitaciones</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>{capacitaciones.length} capacitación{capacitaciones.length !== 1 ? 'es' : ''} registrada{capacitaciones.length !== 1 ? 's' : ''}</p>
        <button onClick={exportarExcelCapacitaciones} style={{ ...s.btnInfo, display: "flex", alignItems: "center", gap: 6 }}>Exportar Excel</button>
        </div>
        <button onClick={function() { setVista('nueva'); setSeleccionados([]); setBusquedaColab(''); setForm({ nombre: '', descripcion: '', fecha: '', duracion_horas: '', instructor: '', url_material: '', tipo: 'interna' }); }} style={s.btnPrimario}>
          + Nueva capacitación
        </button>
      </div>
      {capacitaciones.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: 60, textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>No hay capacitaciones cargadas aún.</p>
          <p style={{ color: '#64748b', fontSize: 13, margin: '8px 0 0 0' }}>Hacé clic en "Nueva capacitación" para comenzar.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {capacitaciones.map(function(cap) {
            var nPart = (cap.capacitacion_participantes || []).length;
            return (
              <div key={cap.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', borderLeft: '4px solid #231F20', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#231F20' }}>{cap.nombre}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#F0EDE8', color: '#231F20' }}>{nPart} participante{nPart !== 1 ? 's' : ''}</span>
                    {cap.url_material && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#166534' }}>Con material</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {cap.fecha && <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(cap.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                    {cap.duracion_horas && <span style={{ fontSize: 12, color: '#64748b' }}>{cap.duracion_horas} hs</span>}
                    {cap.instructor && <span style={{ fontSize: 12, color: '#64748b' }}>Instructor: {cap.instructor}</span>}
                  </div>
                  {cap.descripcion && <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{cap.descripcion}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={function() { abrirDetalle(cap); }} style={s.btnInfo}>Ver / Editar</button>
                  <button onClick={function() { eliminarCapacitacion(cap.id); }} style={{ ...s.btnInfo, color: '#dc2626', borderColor: '#fca5a5', background: '#fee2e2' }}>Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ObjetivosCompania({ esAdmin }) {
 var [objetivos, setObjetivos] = useState([]);
 var [carg, setCarg] = useState(true);
 var [seleccionado, setSeleccionado] = useState(null);
 var [editando, setEditando] = useState(null); // id del obj en edición, o 'nuevo'
 var [form, setForm] = useState({});
 var [confirmBorrar, setConfirmBorrar] = useState(null);

 useEffect(function() { cargar(); }, []);

 async function cargar() {
 var { data } = await supabase.from('objetivos_compania').select('*').eq('activo', true).order('orden', { ascending: true });
 setObjetivos(data || []); setCarg(false);
 }

 function abrirForm(obj) {
 setForm(obj ? { ...obj } : { nombre: '', icono: '', resumen: '', descripcion: '', meta: '', medicion: '', orden: (objetivos.length + 1) });
 setEditando(obj ? obj.id : 'nuevo');
 setSeleccionado(null);
 }

 async function guardar() {
 if (!form.nombre) return alert('El nombre es obligatorio');
 if (editando === 'nuevo') {
 await supabase.from('objetivos_compania').insert({ nombre: form.nombre, icono: form.icono || '', resumen: form.resumen, descripcion: form.descripcion, meta: form.meta, medicion: form.medicion, orden: form.orden || 0, activo: true });
 } else {
 await supabase.from('objetivos_compania').update({ nombre: form.nombre, icono: form.icono, resumen: form.resumen, descripcion: form.descripcion, meta: form.meta, medicion: form.medicion, orden: form.orden }).eq('id', editando);
 }
 setEditando(null); setForm({});
 cargar();
 }

 async function borrar(id) {
 await supabase.from('objetivos_compania').update({ activo: false }).eq('id', id);
 setConfirmBorrar(null); setSeleccionado(null);
 cargar();
 }

 if (carg) return <p>Cargando...</p>;

 var ICONOS = ['', '', '', '', '', '', '', '', '', '⭐'];

 return (
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
 <div>
 <h2 style={{ color: '#231F20', margin: '0 0 6px 0', fontSize: 22, fontWeight: 700 }}>Objetivos de la Compañía 2026</h2>
 <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Objetivos estratégicos de Fabric Group. Hacé clic en una tarjeta para ver el detalle.</p>
 </div>
 {esAdmin && (
 <button onClick={function() { abrirForm(null); }} style={{ ...s.btnPrimario, background: '#22c55e', fontSize: 13, padding: '10px 20px' }}>
 Agregar objetivo
 </button>
 )}
 </div>

 {/* Modal formulario */}
 {editando && (
 <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={function() { setEditando(null); }}>
 <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 600, width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
 <h3 style={{ margin: '0 0 20px 0', color: '#231F20' }}>{editando === 'nuevo' ? 'Agregar objetivo' : 'Editar Objetivo'}</h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Nombre *</label>
 <input value={form.nombre || ''} onChange={function(e) { setForm({...form, nombre: e.target.value}); }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14, boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Ícono</label>
 <select value={form.icono || ''} onChange={function(e) { setForm({...form, icono: e.target.value}); }} style={{ padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 20 }}>
 {ICONOS.map(function(ic) { return <option key={ic} value={ic}>{ic}</option>; })}
 </select>
 </div>
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Resumen (se ve en la tarjeta)</label>
 <textarea value={form.resumen || ''} onChange={function(e) { setForm({...form, resumen: e.target.value}); }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13, minHeight: 70, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Descripción completa (se ve en el detalle)</label>
 <textarea value={form.descripcion || ''} onChange={function(e) { setForm({...form, descripcion: e.target.value}); }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13, minHeight: 120, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Meta</label>
 <input value={form.meta || ''} onChange={function(e) { setForm({...form, meta: e.target.value}); }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13, boxSizing: 'border-box' }} />
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Medición</label>
 <input value={form.medicion || ''} onChange={function(e) { setForm({...form, medicion: e.target.value}); }} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13, boxSizing: 'border-box' }} />
 </div>
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Orden</label>
 <input type="number" value={form.orden || 0} onChange={function(e) { setForm({...form, orden: parseInt(e.target.value)}); }} style={{ width: 80, padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 13 }} />
 </div>
 </div>
 <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
 <button onClick={guardar} style={{ ...s.btnPrimario, flex: 1 }}>Guardar</button>
 <button onClick={function() { setEditando(null); }} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 )}

 {/* Modal confirmar borrar */}
 {confirmBorrar && (
 <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
 <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%' }}>
 <h3 style={{ margin: '0 0 12px 0' }}>¿Eliminar objetivo?</h3>
 <p style={{ color: '#64748b', marginBottom: 24 }}>Esta acción no se puede deshacer.</p>
 <div style={{ display: 'flex', gap: 12 }}>
 <button onClick={function() { borrar(confirmBorrar); }} style={{ ...s.btnPrimario, background: '#dc2626', flex: 1 }}>Eliminar</button>
 <button onClick={function() { setConfirmBorrar(null); }} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 )}

 {/* Tarjetas */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
 {objetivos.map(function(obj) {
 var activo = seleccionado === obj.id;
 return (
 <div key={obj.id} style={{ position: 'relative' }}>
 {/* Botones admin */}
 {esAdmin && (
 <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 10 }}>
 <button onClick={function(e) { e.stopPropagation(); abrirForm(obj); }} style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Editar</button>
 <button onClick={function(e) { e.stopPropagation(); setConfirmBorrar(obj.id); }} style={{ background: 'rgba(220,38,38,0.85)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'white', fontWeight: 600 }}>Eliminar</button>
 </div>
 )}
 <div
 onClick={function() { setSeleccionado(activo ? null : obj.id); }}
 style={{
 background: activo ? '#231F20' : '#D4D2C6',
 borderRadius: 14, padding: '24px 22px', cursor: 'pointer',
 border: '2px solid ' + (activo ? '#231F20' : '#C8C6BA'),
 boxShadow: activo ? '0 4px 20px rgba(35,31,32,0.18)' : '0 2px 8px rgba(0,0,0,0.06)',
 transition: 'all 0.18s ease', position: 'relative', overflow: 'hidden',
 }}>
 <div style={{ position: 'absolute', top: 16, right: 18, fontSize: 42, fontWeight: 900, opacity: 0.08, color: activo ? '#fff' : '#231F20', lineHeight: 1, fontFamily: 'Georgia, serif' }}>0{objetivos.indexOf(obj) + 1}</div>
 <div style={{ fontSize: 28, marginBottom: 10 }}>{obj.icono || ''}</div>
 <h3 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 700, color: activo ? '#D4D2C6' : '#231F20' }}>{obj.nombre}</h3>
 <p style={{ margin: '0 0 16px 0', fontSize: 13, color: activo ? '#C8C6BA' : '#475569', lineHeight: 1.55 }}>{obj.resumen}</p>
 <div style={{ fontSize: 12, fontWeight: 600, color: activo ? '#D4D2C6' : '#231F20', borderTop: '1px solid ' + (activo ? 'rgba(212,210,198,0.3)' : 'rgba(35,31,32,0.12)'), paddingTop: 12 }}>
 {activo ? '▲ Ocultar detalle' : '▼ Ver detalle'}
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Panel detalle */}
 {seleccionado && (function() {
 var obj = objetivos.find(function(o) { return o.id === seleccionado; });
 if (!obj) return null;
 return (
 <div style={{ background: 'white', border: '2px solid #231F20', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 24px rgba(35,31,32,0.10)' }}>
 <div style={{ background: '#231F20', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
 <span style={{ fontSize: 28 }}>{obj.icono || ''}</span>
 <div>
 <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Objetivo estratégico 2026</p>
 <h3 style={{ margin: '2px 0 0 0', fontSize: 20, fontWeight: 700, color: '#D4D2C6' }}>{obj.nombre}</h3>
 </div>
 </div>
 <button onClick={function() { setSeleccionado(null); }} style={{ background: 'rgba(212,210,198,0.15)', border: '1px solid rgba(212,210,198,0.3)', borderRadius: 8, color: '#D4D2C6', cursor: 'pointer', fontSize: 18, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}></button>
 </div>
 <div style={{ padding: '24px 28px' }}>
 <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
 {obj.meta && <div style={{ background: '#f8f7f4', border: '1px solid #D4D2C6', borderRadius: 8, padding: '8px 14px' }}><p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Meta</p><p style={{ margin: '2px 0 0 0', fontSize: 14, fontWeight: 700, color: '#231F20' }}>{obj.meta}</p></div>}
 {obj.medicion && <div style={{ background: '#f8f7f4', border: '1px solid #D4D2C6', borderRadius: 8, padding: '8px 14px' }}><p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Medición</p><p style={{ margin: '2px 0 0 0', fontSize: 14, fontWeight: 700, color: '#231F20' }}>{obj.medicion}</p></div>}
 </div>
 {obj.descripcion && (
 <div style={{ background: '#fafaf8', border: '1px solid #e8e6e0', borderRadius: 10, padding: '18px 20px' }}>
 <p style={{ margin: '0 0 8px 0', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>Descripción completa</p>
 <p style={{ margin: 0, fontSize: 14, color: '#231F20', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{obj.descripcion}</p>
 </div>
 )}
 </div>
 </div>
 );
 })()}
 </div>
 );
}

// =============================================
// GESTIÓN DE MÓDULOS POR USUARIO (solo superadmin)
// =============================================
// =============================================
// GESTIÓN DE USUARIOS (superadmin)
// =============================================
function GestionVisibilidad() {
 var [usuarios, setUsuarios] = useState([]);
 var [visibilidades, setVisibilidades] = useState({});
 var [carg, setCarg] = useState(true);
 var [editando, setEditando] = useState(null);
 var [form, setForm] = useState({ tipo: 'area', valor: '' });
 var [msg, setMsg] = useState('');
 var [busqueda, setBusqueda] = useState('');

 var AREAS = ['RRHH','Operaciones','Marketing','Administración&Finanzas','Compras','Expansión','Comercial','Desarrollo Comercial','Gerencia General'];

 useEffect(function() { cargar(); }, []);

 async function cargar() {
 var [{ data: users }, { data: vis }] = await Promise.all([
 supabase.from('profiles').select('id, email, full_name, area, puesto, role').eq('activo', true).order('full_name'),
 supabase.from('equipo_visibilidad').select('*'),
 ]);
 var mapa = {};
 (users || []).forEach(function(u) { mapa[u.id] = []; });
 (vis || []).forEach(function(v) { if (mapa[v.lider_id]) mapa[v.lider_id].push(v); });
 setUsuarios(users || []);
 setVisibilidades(mapa);
 setCarg(false);
 }

 async function agregarVisibilidad(liderId) {
 if (!form.tipo) return;
 var valor = form.tipo === 'todos' ? null : form.valor;
 if (form.tipo !== 'todos' && !valor) return alert('Ingresá un valor');
 var { error } = await supabase.from('equipo_visibilidad').insert({ lider_id: liderId, tipo: form.tipo, valor: valor });
 if (error) { setMsg('Error: ' + error.message); return; }
 setMsg('Guardado');
 setTimeout(function() { setMsg(''); }, 2000);
 cargar();
 }

 async function eliminarVisibilidad(id) {
 await supabase.from('equipo_visibilidad').delete().eq('id', id);
 cargar();
 }

 var TAG_COLORS = { todos: { bg: '#231F20', color: '#D4D2C6' }, area: { bg: '#dbeafe', color: '#1e40af' }, usuario: { bg: '#dcfce7', color: '#166534' } };

 var usuariosFiltrados = busqueda
 ? usuarios.filter(function(u) { return (u.full_name || '').toLowerCase().includes(busqueda.toLowerCase()) || (u.area || '').toLowerCase().includes(busqueda.toLowerCase()); })
 : usuarios;

 if (carg) return <p>Cargando...</p>;

 return (
 <div>
 <div style={{ marginBottom: 24 }}>
 <h2 style={{ color: '#231F20', margin: '0 0 4px 0', fontSize: 20, fontWeight: 700 }}>Visibilidad de Equipo</h2>
 <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>Configurá qué usuarios o áreas puede ver cada líder en Evaluaciones y Objetivos.</p>
 </div>

 {msg && <div style={{ padding: 12, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#166534', fontWeight: 600 }}>{msg}</div>}

 <input value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }}
 placeholder="Buscar colaborador o área..."
 style={{ width: '100%', maxWidth: 360, padding: '9px 14px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, marginBottom: 20, boxSizing: 'border-box' }} />

 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
 {usuariosFiltrados.map(function(u) {
 var vis = visibilidades[u.id] || [];
 var abierto = editando === u.id;
 return (
 <div key={u.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e6e0', padding: '16px 20px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
 <div>
 <strong style={{ color: '#231F20', fontSize: 14 }}>{u.full_name || u.email}</strong>
 <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>{u.puesto || u.area} · {u.area}</p>
 </div>
 <button onClick={function() { setEditando(abierto ? null : u.id); setForm({ tipo: 'area', valor: '' }); }}
 style={{ ...s.btnInfo, fontSize: 12 }}>
 {abierto ? 'Cerrar' : '+ Agregar visibilidad'}
 </button>
 </div>

 {/* Tags de visibilidad actual */}
 {vis.length > 0 && (
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
 {vis.map(function(v) {
 var tc = TAG_COLORS[v.tipo] || TAG_COLORS.area;
 return (
 <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: tc.bg, color: tc.color }}>
 {v.tipo === 'todos' ? 'Toda la compañía' : v.tipo === 'area' ? 'Área: ' + v.valor : 'Usuario'}
 <button onClick={function() { eliminarVisibilidad(v.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
 </span>
 );
 })}
 </div>
 )}
 {vis.length === 0 && <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Solo ve sus reportes directos</p>}

 {/* Formulario agregar */}
 {abierto && (
 <div style={{ marginTop: 14, padding: 14, background: '#F0EDE8', borderRadius: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
 <div>
 <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Tipo</label>
 <select value={form.tipo} onChange={function(e) { setForm({ tipo: e.target.value, valor: '' }); }}
 style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white' }}>
 <option value="todos">Toda la compañía</option>
 <option value="area">Por área</option>
 <option value="usuario">Por usuario específico</option>
 </select>
 </div>
 {form.tipo === 'area' && (
 <div>
 <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Área</label>
 <select value={form.valor} onChange={function(e) { setForm({ ...form, valor: e.target.value }); }}
 style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white' }}>
 <option value="">Seleccionar...</option>
 {AREAS.map(function(a) { return <option key={a} value={a}>{a}</option>; })}
 </select>
 </div>
 )}
 {form.tipo === 'usuario' && (
 <div>
 <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Usuario</label>
 <select value={form.valor} onChange={function(e) { setForm({ ...form, valor: e.target.value }); }}
 style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, background: 'white', minWidth: 200 }}>
 <option value="">Seleccionar...</option>
 {usuarios.filter(function(x) { return x.id !== u.id; }).map(function(x) { return <option key={x.id} value={x.id}>{x.full_name || x.email}</option>; })}
 </select>
 </div>
 )}
 <button onClick={function() { agregarVisibilidad(u.id); }} style={{ ...s.btnPrimario, fontSize: 12, padding: '8px 16px' }}>Agregar</button>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}

function GestionUsuarios() {
 var [usuarios, setUsuarios] = useState([]);
 var [carg, setCarg] = useState(true);
 var [editandoPuesto, setEditandoPuesto] = useState(null);
 var [puestoTemp, setPuestoTemp] = useState("");
 var [busqueda, setBusqueda] = useState('');
 var [modalNuevo, setModalNuevo] = useState(false);
 var [modalPass, setModalPass] = useState(null); // user object
 var [formNuevo, setFormNuevo] = useState({ email: '', full_name: '', area: '', seniority: 'Analista', role: 'colaborador', password: '' });
 var [nuevaPass, setNuevaPass] = useState('');
 var [msg, setMsg] = useState('');
 var [guardando, setGuardando] = useState(false);

 var SENIORITIES = ['Analista', 'Especialista/Supervisor', 'Jefe/Experto', 'Gerente'];
 var ROLES = ['colaborador', 'lider', 'admin_rrhh'];

 useEffect(function() { cargar(); }, []);

 async function cargar() {
 var { data } = await supabase.from("profiles").select("id, email, full_name, area, seniority, puesto, role, activo, leader_id, fecha_ingreso").order("full_name");
 setUsuarios(data || []); setCarg(false);
 }

 async function toggleActivo(user) {
 await supabase.from('profiles').update({ activo: !user.activo }).eq('id', user.id);
 setUsuarios(function(prev) { return prev.map(function(u) { return u.id === user.id ? { ...u, activo: !u.activo } : u; }); });
 }

 async function guardarPuesto(userId) {
 await supabase.from("profiles").update({ puesto: puestoTemp }).eq("id", userId);
 setUsuarios(function(prev) { return prev.map(function(u) { return u.id === userId ? { ...u, puesto: puestoTemp } : u; }); });
 setEditandoPuesto(null);
 }

 async function guardarFechaIngreso(userId, fecha) {
 await supabase.from("profiles").update({ fecha_ingreso: fecha || null }).eq("id", userId);
 setUsuarios(function(prev) { return prev.map(function(u) { return u.id === userId ? { ...u, fecha_ingreso: fecha } : u; }); });
 }

 async function asignarLider(userId, liderId) {
 await supabase.from("profiles").update({ leader_id: liderId || null }).eq("id", userId);
 setUsuarios(function(prev) { return prev.map(function(u) { return u.id === userId ? { ...u, leader_id: liderId || null } : u; }); });
 }

 async function crearUsuario() {
 if (!formNuevo.email || !formNuevo.password || !formNuevo.full_name) return alert('Email, nombre y contraseña son obligatorios');
 setGuardando(true);
 // Crear en Supabase Auth via admin API — usamos signUp desde el cliente
 var { data: authData, error: authErr } = await supabase.auth.signUp({
 email: formNuevo.email,
 password: formNuevo.password,
 options: { data: { full_name: formNuevo.full_name } }
 });
 if (authErr) { setMsg('Error: ' + authErr.message); setGuardando(false); return; }
 // Crear perfil
 if (authData?.user?.id) {
 await supabase.from('profiles').upsert({
 id: authData.user.id, email: formNuevo.email, full_name: formNuevo.full_name,
 area: formNuevo.area, seniority: formNuevo.seniority, role: formNuevo.role, activo: true
 });
 }
 setMsg('Usuario creado. Debe confirmar su email para poder ingresar.');
 setModalNuevo(false);
 setFormNuevo({ email: '', full_name: '', area: '', seniority: 'Analista', role: 'colaborador', password: '' });
 setGuardando(false); cargar();
 setTimeout(function() { setMsg(''); }, 4000);
 }

 async function cambiarPassword() {
 if (!nuevaPass || nuevaPass.length < 6) return alert('La contraseña debe tener al menos 6 caracteres');
 setGuardando(true);
 // Usar Supabase Admin API via edge function o update directo
 var { error } = await supabase.auth.admin.updateUserById(modalPass.id, { password: nuevaPass });
 if (error) {
 // Fallback: si no tiene admin SDK, usar update normal solo si es el usuario logueado
 var { error: err2 } = await supabase.auth.updateUser({ password: nuevaPass });
 if (err2) { setMsg('Error: necesitás permisos de admin para cambiar contraseñas de otros usuarios'); setGuardando(false); return; }
 }
 setMsg('Contraseña actualizada para ' + modalPass.email);
 setModalPass(null); setNuevaPass(''); setGuardando(false);
 setTimeout(function() { setMsg(''); }, 4000);
 }

 var usuariosFiltrados = busqueda
 ? usuarios.filter(function(u) { return (u.full_name || '').toLowerCase().includes(busqueda.toLowerCase()) || (u.email || '').toLowerCase().includes(busqueda.toLowerCase()); })
 : usuarios;

 if (carg) return <p>Cargando usuarios...</p>;

 return (
 <div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
 <div>
 <h2 style={{ margin: '0 0 4px 0', color: '#231F20' }}>Gestión de Usuarios</h2>
 <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{usuarios.length} usuarios — {usuarios.filter(function(u) { return u.activo; }).length} activos</p>
 </div>
 <button onClick={function() { setModalNuevo(true); }} style={{ ...s.btnPrimario, background: '#22c55e' }}>Nuevo Usuario</button>
 </div>

 {msg && <div style={{ padding: 12, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#166534', fontWeight: 600 }}>{msg}</div>}

 <input value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }}
 placeholder="Buscar por nombre o email..."
 style={{ width: '100%', maxWidth: 360, padding: '10px 14px', borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />

 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
 <thead>
 <tr style={{ background: '#231F20' }}>
 {['Nombre', 'Email', 'Area', 'Seniority', 'Puesto', 'Ingreso', 'Rol', 'Lider', 'Estado'].map(function(h) {
 return <th key={h} style={{ ...th, color: '#D4D2C6', padding: '12px 14px' }}>{h}</th>;
 })}
 </tr>
 </thead>
 <tbody>
 {usuariosFiltrados.map(function(u, idx) {
 return (
 <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafaf8' }}>
 <td style={{ ...td, padding: '12px 14px' }}><strong style={{ color: '#231F20' }}>{u.full_name || '-'}</strong></td>
 <td style={{ ...td, padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{u.email}</td>
 <td style={{ ...td, padding: '12px 14px' }}>{u.area || '-'}</td>
 <td style={{ ...td, padding: '12px 14px' }}>
 <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#D4D2C6', color: '#231F20' }}>{u.seniority || '-'}</span>
 </td>
 {/* Puesto — editable inline */}
 <td style={{ ...td, padding: '8px 14px', minWidth: 160 }}>
 {editandoPuesto === u.id ? (
 <div style={{ display: 'flex', gap: 4 }}>
 <input
 value={puestoTemp}
 onChange={function(e) { setPuestoTemp(e.target.value); }}
 onKeyDown={function(e) { if (e.key === 'Enter') guardarPuesto(u.id); if (e.key === 'Escape') setEditandoPuesto(null); }}
 autoFocus
 style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '2px solid #231F20', fontSize: 12, boxSizing: 'border-box' }} />
 <button onClick={function() { guardarPuesto(u.id); }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#231F20', color: 'white', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>OK</button>
 </div>
 ) : (
 <span
 onClick={function() { setEditandoPuesto(u.id); setPuestoTemp(u.puesto || ''); }}
 style={{ cursor: 'pointer', fontSize: 12, color: u.puesto ? '#231F20' : '#94a3b8', fontStyle: u.puesto ? 'normal' : 'italic', borderBottom: '1px dashed #D4D2C6' }}
 title="Clic para editar">
 {u.puesto || 'Sin puesto'}
 </span>
 )}
 </td>
 {/* Fecha ingreso */}
 <td style={{ ...td, padding: '8px 14px' }}>
 <input
 type="date"
 value={u.fecha_ingreso || ''}
 onChange={function(e) { var _uid = u.id; guardarFechaIngreso(_uid, e.target.value); }}
 style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D4D2C6', fontSize: 12, color: '#231F20' }} />
 </td>
 <td style={{ ...td, padding: '12px 14px' }}>
 <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
 background: u.role === 'admin_rrhh' ? '#231F20' : u.role === 'lider' ? '#dbeafe' : '#f1f5f9',
 color: u.role === 'admin_rrhh' ? '#D4D2C6' : u.role === 'lider' ? '#1e40af' : '#64748b' }}>
 {u.role}
 </span>
 </td>
 <td style={{ ...td, padding: "8px 14px", minWidth: 160 }}>
 {(u.role !== "admin_rrhh" || u.email === "florencia.salvaneschi@grupo-fabric.com" || u.email === "adrian.galvan@grupo-fabric.com") ? (
 <select
 value={u.leader_id || ""}
 onChange={function(e) { var _uid = u.id; asignarLider(_uid, e.target.value); }}
 style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #D4D2C6", fontSize: 12, background: "white" }}>
 <option value="">Sin lider</option>
 {usuarios.filter(function(l) { return l.id !== u.id && l.activo; }).sort(function(a,b) { return (a.full_name||"").localeCompare(b.full_name||""); }).map(function(l) {
 return <option key={l.id} value={l.id}>{l.full_name || l.email}</option>;
 })}
 </select>
 ) : (
 <span style={{ fontSize: 12, color: "#94a3b8" }}>Admin</span>
 )}
 </td>
 <td style={{ ...td, padding: '12px 14px', textAlign: 'center' }}>
 <button onClick={function() { toggleActivo(u); }} style={{
 padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
 background: u.activo ? '#dcfce7' : '#fee2e2',
 color: u.activo ? '#166534' : '#dc2626'
 }}>{u.activo ? 'Activo' : 'Inactivo'}</button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* Modal nuevo usuario */}
 {modalNuevo && (
 <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={function() { setModalNuevo(false); }}>
 <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 500, width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
 <h3 style={{ marginTop: 0 }}>Nuevo Usuario</h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
 {[
 { label: 'Nombre completo *', key: 'full_name', type: 'text', placeholder: 'Juan Perez' },
 { label: 'Email corporativo *', key: 'email', type: 'email', placeholder: 'juan@grupo-fabric.com' },
 { label: 'Contraseña inicial *', key: 'password', type: 'password', placeholder: 'Min. 6 caracteres' },
 { label: 'Area', key: 'area', type: 'text', placeholder: 'Ej: Operaciones' },
 ].map(function(f) {
 return (
 <div key={f.key}>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{f.label}</label>
 <input type={f.type} value={formNuevo[f.key] || ''} placeholder={f.placeholder}
 onChange={function(e) { var u = {}; u[f.key] = e.target.value; setFormNuevo({...formNuevo, ...u}); }}
 style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14, boxSizing: 'border-box' }} />
 </div>
 );
 })}
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Seniority</label>
 <select value={formNuevo.seniority} onChange={function(e) { setFormNuevo({...formNuevo, seniority: e.target.value}); }}
 style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14 }}>
 {SENIORITIES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
 </select>
 </div>
 <div>
 <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Rol</label>
 <select value={formNuevo.role} onChange={function(e) { setFormNuevo({...formNuevo, role: e.target.value}); }}
 style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14 }}>
 {ROLES.map(function(r) { return <option key={r} value={r}>{r}</option>; })}
 </select>
 </div>
 </div>
 <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
 <button onClick={crearUsuario} disabled={guardando} style={{ ...s.btnPrimario, background: '#22c55e', flex: 1 }}>
 {guardando ? 'Creando...' : 'Crear Usuario'}
 </button>
 <button onClick={function() { setModalNuevo(false); }} style={s.btnSecundario}>Cancelar</button>
 </div>
 </div>
 </div>
 )}

 </div>
 );
}

function GestionModulos() {
 var [usuarios, setUsuarios] = useState([]);
 var [modulos, setModulos] = useState({});
 var [carg, setCarg] = useState(true);
 var [guardando, setGuardando] = useState(null);
 var [busqueda, setBusqueda] = useState('');

 var MODULOS_DISPONIBLES = [
 { id: 'desempeno', label: ' Desempeño', desc: 'Evaluaciones y ciclos' },
 { id: 'obj_individual', label: ' Objetivos Individuales', desc: 'Mis objetivos y equipo' },
 { id: 'obj_compania', label: ' Objetivos Compañía', desc: 'Objetivos estratégicos' },
 { id: 'capacitaciones', label: ' Capacitaciones', desc: 'Mis capacitaciones y certificados' },
 ];

 useEffect(function() { cargar(); }, []);

 async function cargar() {
 var [{ data: users }, { data: mods }] = await Promise.all([
 supabase.from('profiles').select('id, email, full_name, area, seniority, puesto, role').or('role.neq.admin_rrhh,email.eq.florencia.salvaneschi@grupo-fabric.com,email.eq.adrian.galvan@grupo-fabric.com').eq('activo', true).order('full_name'),
 supabase.from('modulos_usuario').select('user_id, modulo, activo'),
 ]);
 // Armar mapa: { user_id: { modulo: true/false } }
 var mapaModulos = {};
 (users || []).forEach(function(u) { mapaModulos[u.id] = {}; });
 (mods || []).forEach(function(m) {
 if (mapaModulos[m.user_id]) mapaModulos[m.user_id][m.modulo] = m.activo;
 });
 setUsuarios(users || []);
 setModulos(mapaModulos);
 setCarg(false);
 }

 async function toggleModulo(userId, moduloId, valorActual) {
 setGuardando(userId + moduloId);
 var nuevoValor = !valorActual;
 await supabase.from('modulos_usuario').upsert({ user_id: userId, modulo: moduloId, activo: nuevoValor, updated_at: new Date() }, { onConflict: 'user_id,modulo' });
 setModulos(function(prev) {
 var nuevo = { ...prev };
 nuevo[userId] = { ...nuevo[userId], [moduloId]: nuevoValor };
 return nuevo;
 });
 setGuardando(null);
 }

 async function habilitarTodo(userId) {
 for (var mod of MODULOS_DISPONIBLES) {
 await supabase.from('modulos_usuario').upsert({ user_id: userId, modulo: mod.id, activo: true, updated_at: new Date() }, { onConflict: 'user_id,modulo' });
 }
 setModulos(function(prev) {
 var nuevo = { ...prev };
 nuevo[userId] = { desempeño: true, obj_individual: true, obj_compania: true, capacitaciones: true };
 return nuevo;
 });
 }

 async function deshabilitarTodo(userId) {
 for (var mod of MODULOS_DISPONIBLES) {
 await supabase.from('modulos_usuario').upsert({ user_id: userId, modulo: mod.id, activo: false, updated_at: new Date() }, { onConflict: 'user_id,modulo' });
 }
 setModulos(function(prev) {
 var nuevo = { ...prev };
 nuevo[userId] = { desempeño: false, obj_individual: false, obj_compania: false, capacitaciones: false };
 return nuevo;
 });
 }

 if (carg) return <p>Cargando usuarios...</p>;

 var usuariosFiltrados = busqueda
 ? usuarios.filter(function(u) { return (u.full_name || u.email).toLowerCase().includes(busqueda.toLowerCase()) || (u.area || '').toLowerCase().includes(busqueda.toLowerCase()); })
 : usuarios;

 return (
 <div>
 <div style={{ marginBottom: 24 }}>
 <h2 style={{ color: '#231F20', margin: '0 0 6px 0' }}>Gestión de Módulos por Usuario</h2>
 <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Habilitá o deshabilitá qué módulos puede ver cada colaborador en el menú.</p>
 </div>

 {/* Leyenda de módulos */}
 <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
 {MODULOS_DISPONIBLES.map(function(m) {
 return (
 <div key={m.id} style={{ background: '#f8f7f4', border: '1px solid #D4D2C6', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
 <strong>{m.label}</strong><span style={{ color: '#64748b', marginLeft: 6 }}>{m.desc}</span>
 </div>
 );
 })}
 </div>

 {/* Buscador */}
 <input
 value={busqueda} onChange={function(e) { setBusqueda(e.target.value); }}
 placeholder="Buscar por nombre o área..."
 style={{ width: '100%', maxWidth: 360, padding: '10px 14px', borderRadius: 8, border: '1px solid #D4D2C6', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
 />

 {/* Tabla */}
 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
 <thead>
 <tr style={{ background: '#231F20' }}>
 <th style={{ ...th, color: '#D4D2C6', padding: '12px 14px' }}>Colaborador</th>
 <th style={{ ...th, color: '#D4D2C6', padding: '12px 14px' }}>Área</th>
 <th style={{ ...th, color: '#D4D2C6', padding: '12px 14px' }}>Seniority</th>
 {MODULOS_DISPONIBLES.map(function(m) {
 return <th key={m.id} style={{ ...th, color: '#D4D2C6', padding: '12px 14px', textAlign: 'center', fontSize: 11 }}>{m.label}</th>;
 })}
 <th style={{ ...th, color: '#D4D2C6', padding: '12px 14px', textAlign: 'center' }}>Acciones</th>
 </tr>
 </thead>
 <tbody>
 {usuariosFiltrados.map(function(u, idx) {
 var modsUser = modulos[u.id] || {};
 return (
 <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafaf8' }}>
 <td style={{ ...td, padding: '12px 14px' }}>
 <strong style={{ color: '#231F20' }}>{u.full_name || '-'}</strong>
 <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>
 </td>
 <td style={{ ...td, padding: '12px 14px' }}>{u.area || '-'}</td>
 <td style={{ ...td, padding: '12px 14px' }}>
 <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#D4D2C6', color: '#231F20' }}>{u.seniority || '-'}</span>
 </td>
 {MODULOS_DISPONIBLES.map(function(m) {
 var activo = modsUser[m.id] === true;
 var cargandoEste = guardando === u.id + m.id;
 var _uid = u.id; var _mid = m.id;
 return (
 <td key={m.id} style={{ ...td, padding: '12px 14px', textAlign: 'center' }}>
 <button
 onClick={function() {
 var val = (modulos[_uid] || {})[_mid] === true;
 toggleModulo(_uid, _mid, val);
 }}
 disabled={cargandoEste}
 style={{
 width: 44, height: 44, borderRadius: 8, border: '2px solid',
 borderColor: activo ? '#231F20' : '#e2e8f0',
 cursor: 'pointer', fontSize: 18, fontWeight: 700,
 background: activo ? '#231F20' : 'white',
 color: activo ? '#D4D2C6' : '#94a3b8',
 opacity: cargandoEste ? 0.5 : 1,
 transition: 'all 0.15s',
 }}>
 {cargandoEste ? '' : activo ? '' : '○'}
 </button>
 </td>
 );
 })}
 <td style={{ ...td, padding: '12px 14px', textAlign: 'center' }}>
 <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
 <button onClick={function() { habilitarTodo(u.id); }} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: 'none', background: '#dcfce7', color: '#166534', cursor: 'pointer', fontWeight: 600 }}>Habilitar todo</button>
 <button onClick={function() { deshabilitarTodo(u.id); }} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Deshabilitar todo</button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 );
}

var th = { textAlign: 'left', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e8e6e0', background: '#F0EDE8' };
var td = { padding: '12px 14px', fontSize: '13px', color: '#231F20', borderBottom: '1px solid #f1f0ec', verticalAlign: 'middle' };
var sidebarStyle = {
 aside: { width: '240px', background: '#231F20', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '20px 0', flexShrink: 0 },
 logoContainer: { padding: '0 20px 20px', borderBottom: '1px solid rgba(212,210,198,0.2)', marginBottom: 16, textAlign: 'center' },
 nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1 },
 menuItem: { padding: '12px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', transition: 'all 0.15s', width: '100%' },
 subMenuItem: { padding: '9px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 400, transition: 'all 0.15s', width: '100%' },
 footer: { padding: '16px 20px', borderTop: '1px solid rgba(212,210,198,0.2)' }

};
var s = {
 centrado: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 20, background: '#F0EDE8' },
 header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 28px', background: '#231F20', borderBottom: '1px solid rgba(212,210,198,0.15)' },
 badge: { padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(212,210,198,0.15)', color: '#D4D2C6', border: '1px solid rgba(212,210,198,0.3)' },
 btnSalir: { padding: '7px 16px', background: 'transparent', color: '#D4D2C6', border: '1px solid rgba(212,210,198,0.4)', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: 12 },
 tarjetaStat: { background: 'white', padding: 20, borderRadius: 12, marginBottom: 12, border: '1px solid #e8e6e0' },
 grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
 seccionTitulo: { fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e6e0', textTransform: 'uppercase', letterSpacing: '0.5px' },
 competenciaCard: { background: 'white', padding: 18, borderRadius: 10, marginBottom: 12, border: '1px solid #e8e6e0', overflow: 'hidden' },
  btnInfo: { fontSize: 13, padding: "10px 22px", borderRadius: 8, border: "1px solid #231F20", background: "white", cursor: "pointer", color: "#231F20", fontWeight: 600 },
 ratingRow: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' },
 ratingBtn: { width: 40, height: 40, borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' },
 ratingInfoBox: { background: '#F0EDE8', padding: 14, borderRadius: 8, marginBottom: 12, border: '1px solid #e8e6e0' },
 ratingInfoItem: { padding: '6px 10px', marginBottom: 3, borderRadius: 4, fontSize: 13, color: '#475569', lineHeight: 1.5 },
 textareaSmall: { width: '100%', minHeight: 44, padding: 10, borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'white' },
 textarea: { width: '100%', minHeight: 100, padding: 12, borderRadius: 8, border: '1px solid #e8e6e0', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: 'white' },
 btnPrimario: { padding: '10px 22px', background: '#231F20', color: '#F0EDE8', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
 mensajeToast: { padding: '12px 20px', background: '#231F20', borderRadius: 8, marginBottom: 16, color: '#F0EDE8', fontWeight: 500, fontSize: 14, textAlign: 'center' },
 bannerEnviado: { padding: 16, background: '#dcfce7', borderRadius: 10, color: '#166534', fontWeight: 600, textAlign: 'center', marginTop: 16, border: '1px solid #86efac' }
};
