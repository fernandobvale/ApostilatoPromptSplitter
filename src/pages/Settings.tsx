import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { PromptTemplate } from '../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, Save } from 'lucide-react';
import './Settings.css';

export default function Settings() {
    const navigate = useNavigate();
    const { user, userProfile } = useAuth();
    const [firstTemplate, setFirstTemplate] = useState('');
    const [middleTemplate, setMiddleTemplate] = useState('');
    const [lastTemplate, setLastTemplate] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchTemplates();
    }, [user]);

    async function fetchTemplates() {
        try {
            const snapshot = await getDocs(collection(db, 'prompt_templates'));
            const data: PromptTemplate[] = snapshot.docs.map(d => ({
                id: d.id,
                ...(d.data() as Omit<PromptTemplate, 'id'>)
            }));

            const userId = user?.uid;

            // Find user templates first, fallback to system templates
            const userFirst = data.find((t) => t.template_type === 'first' && t.user_id === userId);
            const userMiddle = data.find((t) => t.template_type === 'middle' && t.user_id === userId);
            const userLast = data.find((t) => t.template_type === 'last' && t.user_id === userId);

            const systemFirst = data.find((t) => t.template_type === 'first' && !t.user_id);
            const systemMiddle = data.find((t) => t.template_type === 'middle' && !t.user_id);
            const systemLast = data.find((t) => t.template_type === 'last' && !t.user_id);

            const defaultTemplate = `Papel: Atue como um instrutor experiente e didático. O tom deve ser de uma aula formal, mas acessível.

Estrutura da Aula:

Introdução Obrigatória: Inicie EXATAMENTE com a frase: "Nesse curso vamos aprender sobre: {course_title}"

Logo em seguida, instrua o aluno a pegar a apostila para acompanhar o conteúdo visualmente enquanto ouve.

Conteúdo da Aula: {lesson_content}

Conclusão Obrigatória: Encerre a aula EXATAMENTE com a frase: "Obrigado por ficar até aqui e te vejo na próxima aula."

Instruções Adicionais: Foque em explicar com clareza.`;

            setFirstTemplate((userFirst || systemFirst)?.template || defaultTemplate);
            setMiddleTemplate((userMiddle || systemMiddle)?.template || defaultTemplate);
            setLastTemplate((userLast || systemLast)?.template || defaultTemplate);
        } catch (error) {
            console.error('Error fetching templates:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        try {
            const userId = user?.uid || 'anonymous';

            // Save user templates with deterministic document IDs
            await Promise.all([
                setDoc(doc(db, 'prompt_templates', `${userId}_first`), {
                    user_id: userId,
                    template_type: 'first',
                    template: firstTemplate,
                    created_at: new Date().toISOString()
                }),
                setDoc(doc(db, 'prompt_templates', `${userId}_middle`), {
                    user_id: userId,
                    template_type: 'middle',
                    template: middleTemplate,
                    created_at: new Date().toISOString()
                }),
                setDoc(doc(db, 'prompt_templates', `${userId}_last`), {
                    user_id: userId,
                    template_type: 'last',
                    template: lastTemplate,
                    created_at: new Date().toISOString()
                }),
            ]);

            alert('Templates salvos com sucesso!');
        } catch (error) {
            console.error('Error saving templates:', error);
            alert('Erro ao salvar templates.');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
            </div>
        );
    }

    return (
        <div className="settings-container">
            <header className="settings-header">
                <div className="header-content">
                    <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft size={18} />
                        Voltar
                    </button>
                    <h1>Configurações</h1>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <div className="spinner" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Salvar
                            </>
                        )}
                    </button>
                </div>
            </header>

            <main className="settings-main">
                <div className="container">
                    <section className="profile-section fade-in">
                        <h2>Perfil</h2>
                        <div className="profile-info">
                            <div className="info-item">
                                <span className="label">Email:</span>
                                <span>{userProfile?.email || user?.email}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Função:</span>
                                <span>
                                    {userProfile?.role === 'admin'
                                        ? 'Administrador de Metodologia'
                                        : userProfile?.role === 'designer'
                                            ? 'Designer Instrucional'
                                            : 'Assistente de Produção'}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="templates-section">
                        <h2>Templates de Prompt</h2>
                        <p className="section-description">
                            Personalize os templates utilizados para gerar prompts de IA. Use{' '}
                            <code>{'{course_title}'}</code>, <code>{'{lesson_content}'}</code> e{' '}
                            <code>{'{aula}'}</code> como variáveis.
                        </p>

                        <div className="template-group">
                            <label className="label">Template para Primeira Aula</label>
                            <textarea
                                className="textarea template-textarea"
                                value={firstTemplate}
                                onChange={(e) => setFirstTemplate(e.target.value)}
                                placeholder="Template para a primeira aula do curso..."
                            />
                        </div>

                        <div className="template-group">
                            <label className="label">Template para Aulas Intermediárias</label>
                            <textarea
                                className="textarea template-textarea"
                                value={middleTemplate}
                                onChange={(e) => setMiddleTemplate(e.target.value)}
                                placeholder="Template para aulas intermediárias..."
                            />
                        </div>

                        <div className="template-group">
                            <label className="label">Template para Última Aula</label>
                            <textarea
                                className="textarea template-textarea"
                                value={lastTemplate}
                                onChange={(e) => setLastTemplate(e.target.value)}
                                placeholder="Template para a última aula do curso..."
                            />
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
