import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, UserPlus } from 'lucide-react';
import './Login.css';

export default function Login() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'admin' | 'designer' | 'assistant'>('designer');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn, signUp } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignUp) {
                await signUp(email, password, role);
            } else {
                await signIn(email, password);
            }
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-container">
            <div className="login-card fade-in">
                <div className="login-header">
                    <div className="logo-icon">
                        {isSignUp ? <UserPlus size={32} /> : <LogIn size={32} />}
                    </div>
                    <h1>{isSignUp ? 'Criar Conta' : 'Bem-vindo'}</h1>
                    <p>
                        {isSignUp
                            ? 'Crie sua conta para começar a transformar apostilas em aulas'
                            : 'Transforme apostilas em módulos de aulas organizados'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && (
                        <div className="error-message">
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="email" className="label">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            className="input"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="label">
                            Senha
                        </label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    {isSignUp && (
                        <div className="form-group">
                            <label htmlFor="role" className="label">
                                Função
                            </label>
                            <select
                                id="role"
                                className="input"
                                value={role}
                                onChange={(e) => setRole(e.target.value as any)}
                            >
                                <option value="designer">Designer Instrucional</option>
                                <option value="admin">Administrador de Metodologia</option>
                                <option value="assistant">Assistente de Produção</option>
                            </select>
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? (
                            <span className="spinner" />
                        ) : isSignUp ? (
                            'Criar Conta'
                        ) : (
                            'Entrar'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError('');
                        }}
                    >
                        {isSignUp ? 'Já tem uma conta? Entrar' : 'Não tem conta? Criar agora'}
                    </button>
                </div>
            </div>
        </div>
    );
}
