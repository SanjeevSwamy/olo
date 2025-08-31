import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [currentHashtag, setCurrentHashtag] = useState('General');
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingReactions, setLoadingReactions] = useState({});
  const [imageUploading, setImageUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [userReactions, setUserReactions] = useState({});

  const hashtags = ['General', 'Trip', 'CollegeEvents', 'Studies', 'Memes', 'Jobs', 'Confessions', 'Sports'];

  const fetchPosts = useCallback(async (offset = 0) => {
    try {
      const response = await fetch(`${API_BASE}/posts/${currentHashtag}?limit=20&offset=${offset}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (response.ok) {
        const data = await response.json();
        const postsWithCounts = (data.posts || data).map(post => ({
          ...post,
          smacks: post.smacks || 0,
          caps: post.caps || 0,
          replies: (post.replies || []).map(reply => ({
            ...reply,
            smacks: reply.smacks || 0,
            caps: reply.caps || 0
          }))
        }));
        setPosts(postsWithCounts);
        
        if (data.user_reactions) {
          setUserReactions(data.user_reactions);
        }
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        alert('Session expired. Please login again.');
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  }, [currentHashtag, token]);

  useEffect(() => {
    if (token) {
      fetchPosts();
      const interval = setInterval(fetchPosts, 120000);
      return () => clearInterval(interval);
    }
  }, [token, fetchPosts]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      try {
        const parseJwt = (token) => {
          return JSON.parse(atob(token.split('.')[1]));
        };
        
        const decodedToken = parseJwt(storedToken);
        if (decodedToken.exp * 1000 > Date.now()) {
          setUsername(decodedToken.username);
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (e) {
        console.error('Failed to parse token:', e);
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, []);

  const clearCache = async (email) => {
    try {
      const response = await fetch(`${API_BASE}/auth/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Cache cleared: ${data.message} - Try login again!`);
      } else {
        alert('Cache clear failed');
      }
    } catch (error) {
      alert('Cache clear failed');
    }
  };

  const handleLogin = async (email, password, role, agreed) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(), 
          password, 
          role: role.toLowerCase(),
          agreed_disclaimer: agreed 
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem('token', data.token);
        setTimeout(() => {
          alert(`ACCESS GRANTED! Welcome ${data.username} to the network!`);
        }, 500);
      } else {
        throw new Error(data.detail || 'Login failed');
      }
    } catch (error) {
      alert(`ACCESS DENIED: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createPost = async () => {
    if (!newPost.trim()) return;
    
    try {
      const postData = {
        content: newPost.trim(),
        hashtag: currentHashtag
      };
      
      if (replyingTo) {
        postData.parent_id = replyingTo.id;
      }
      
      const response = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData)
      });
      
      if (response.ok) {
        setNewPost('');
        setReplyingTo(null);
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to create post');
      }
    } catch (error) {
      alert('Failed to create post');
    }
  };

  const reactToPost = async (postId, reactionType, isReply = false) => {
    if (loadingReactions[postId]) return;

    setLoadingReactions(prev => ({ ...prev, [postId]: true }));
    const currentReaction = userReactions[postId];
    const oldPosts = posts;
    const newReactionState = currentReaction === reactionType ? null : reactionType;

    setUserReactions(prev => ({ ...prev, [postId]: newReactionState }));

    setPosts(prevPosts => {
      const getUpdatedItem = (item) => {
        if (item.id !== postId) return item;
        const newItem = { ...item };
        
        if (currentReaction === 'smack' && newReactionState !== 'smack') {
          newItem.smacks -= 1;
        } else if (currentReaction !== 'smack' && newReactionState === 'smack') {
          newItem.smacks += 1;
        }
        
        if (currentReaction === 'cap' && newReactionState !== 'cap') {
          newItem.caps -= 1;
        } else if (currentReaction !== 'cap' && newReactionState === 'cap') {
          newItem.caps += 1;
        }
        
        newItem.smacks = Math.max(0, newItem.smacks || 0);
        newItem.caps = Math.max(0, newItem.caps || 0);
        
        return newItem;
      };

      return prevPosts.map(post => {
        if (isReply && post.replies) {
          return { ...post, replies: post.replies.map(getUpdatedItem) };
        }
        return getUpdatedItem(post);
      });
    });

    try {
      const response = await fetch(`${API_BASE}/posts/${postId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type: reactionType })
      });

      if (!response.ok) throw new Error('Server error');

      const data = await response.json();
      
      setUserReactions(prev => ({ ...prev, [postId]: data.user_reaction }));
      setPosts(prevPosts => {
        const syncItem = (item) => item.id === postId ? { ...item, smacks: data.smacks, caps: data.caps } : item;
        return prevPosts.map(post => {
          if (isReply && post.replies) {
            return { ...post, replies: post.replies.map(syncItem) };
          }
          return syncItem(post);
        });
      });
    } catch (error) {
      console.error('Reaction failed, reverting UI.', error);
      setPosts(oldPosts);
      setUserReactions(prev => ({ ...prev, [postId]: currentReaction }));
    } finally {
      setLoadingReactions(prev => {
        const newLoadingState = { ...prev };
        delete newLoadingState[postId];
        return newLoadingState;
      });
    }
  };

  const reportPost = async (postId) => {
    const confirmed = window.confirm('CONFIRM: Report this transmission?');
    if (!confirmed) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts/${postId}/report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`REPORT SUBMITTED: ${data.report_count}/${data.threshold} reports needed for auto-removal.`);
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Report failed');
      }
    } catch (error) {
      alert('Report failed');
    }
  };

  const handleReply = (post) => {
    setReplyingTo(post);
    setNewPost(`@${post.username} `);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewPost('');
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setNewPost(prev => prev + '\n\n' + data.ascii_art);
      } else {
        alert('Image upload failed');
      }
    } catch (error) {
      alert('Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUsername('');
    setPosts([]);
    setNewPost('');
    setReplyingTo(null);
  };

  if (!token) {
    return <HackerLoginPage onLogin={handleLogin} onClearCache={clearCache} loading={loading} />;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--matrix-black)', color: 'var(--neon-green)' }}>
      {/* Matrix Header */}
      <header className="terminal-window sticky top-0 z-50">
        <div className="terminal-header">
          <div className="terminal-dots">
            <div className="terminal-dot close"></div>
            <div className="terminal-dot minimize"></div>
            <div className="terminal-dot maximize"></div>
          </div>
          <div className="flex-1 text-center">
            <span className="terminal-text">COLLEGE.SOCIAL.SYS v2.2.0</span>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <h1 className="terminal-title">🎓 COLLEGE SOCIAL</h1>
            <span className="terminal-text text-sm hidden sm:block">[ANONYMOUS CAMPUS NETWORK]</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="terminal-text text-sm">
              <span className="hacker-username">{username}</span>
              <span className="status-online"> ● ONLINE</span>
            </span>
            <button 
              onClick={logout}
              className="hacker-button"
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      {/* Matrix Navigation */}
      <nav className="matrix-nav sticky top-24 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex space-x-2 overflow-x-auto scrollbar-hide">
            {hashtags.map(tag => (
              <button
                key={tag}
                onClick={() => setCurrentHashtag(tag)}
                className={`hacker-button whitespace-nowrap transition-all duration-300 ${
                  currentHashtag === tag ? 'active' : ''
                }`}
                style={currentHashtag === tag ? {
                  background: 'var(--neon-green)',
                  color: 'var(--matrix-black)',
                  boxShadow: '0 0 20px var(--neon-green)'
                } : {}}
              >
                <span className="hacker-hashtag">{tag}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Terminal */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <HackerPostComposer 
          newPost={newPost}
          setNewPost={setNewPost}
          onSubmit={createPost}
          onImageUpload={handleImageUpload}
          hashtag={currentHashtag}
          imageUploading={imageUploading}
          replyingTo={replyingTo}
          onCancelReply={cancelReply}
        />
        <HackerPostsList 
          posts={posts} 
          hashtag={currentHashtag}
          onReact={reactToPost}
          onReport={reportPost}
          onReply={handleReply}
          userReactions={userReactions}
        />
      </main>
    </div>
  );
}

function HackerLoginPage({ onLogin, onClearCache, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [agreed, setAgreed] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (agreed && !loading) {
      onLogin(email, password, role, agreed);
    }
  };

  const handleClearCache = () => {
    if (!email.trim()) {
      alert('ENTER EMAIL FIRST');
      return;
    }
    onClearCache(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--matrix-black)' }}>
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="terminal-title text-6xl mb-4">⚡ ACCESS TERMINAL ⚡</div>
          <p className="terminal-text">COLLEGE SOCIAL NETWORK v2.2.0</p>
          <p className="terminal-text text-sm mt-2">[AUTHORIZED PERSONNEL ONLY]</p>
        </div>
        
        <div className="terminal-window mb-6">
          <div className="terminal-header">
            <div className="terminal-dots">
              <div className="terminal-dot close"></div>
              <div className="terminal-dot minimize"></div>
              <div className="terminal-dot maximize"></div>
            </div>
            <span className="terminal-text">WARNING.SYS</span>
          </div>
          <div className="p-4">
            <h3 className="terminal-text text-lg mb-2">
              ⚠️ SECURITY NOTICE ⚠️
            </h3>
            <p className="terminal-text text-sm mb-3">
              > COMMUNITY MONITORED NETWORK<br/>
              > ERP CREDENTIALS FOR VERIFICATION ONLY<br/>
              > NO DATA STORED ON REMOTE SERVERS<br/>
              > ANONYMOUS IDENTITY GUARANTEED
            </p>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4"
                style={{ accentColor: 'var(--neon-green)' }}
              />
              <span className="terminal-text text-sm">I ACKNOWLEDGE AND AGREE</span>
            </label>
          </div>
        </div>

        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dots">
              <div className="terminal-dot close"></div>
              <div className="terminal-dot minimize"></div>
              <div className="terminal-dot maximize"></div>
            </div>
            <span className="terminal-text">LOGIN.EXE</span>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block terminal-text text-sm mb-1">
                SELECT_ROLE:
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="hacker-input"
                required
                disabled={loading}
              >
                <option value="student">STUDENT.USER</option>
                <option value="staff">STAFF.ADMIN</option>
              </select>
            </div>
            
            <div>
              <label className="block terminal-text text-sm mb-1">
                ERP_USERNAME:
              </label>
              <input
                type="email"
                placeholder="ENTER_CREDENTIALS..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="hacker-input typing-cursor"
                required
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block terminal-text text-sm mb-1">
                ERP_PASSWORD:
              </label>
              <input
                type="password"
                placeholder="*************"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="hacker-input"
                required
                disabled={loading}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={!agreed || loading}
              className="hacker-button w-full py-3 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="matrix-loading"></div>
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>INITIATE LOGIN SEQUENCE</span>
                </>
              )}
            </button>
          </form>
        </div>

        {showDebug && (
          <div className="terminal-window mt-4">
            <div className="terminal-header">
              <span className="terminal-text">DEBUG.SYS</span>
            </div>
            <div className="p-4">
              <button
                onClick={handleClearCache}
                className="hacker-button w-full"
              >
                🧹 FLUSH_CACHE.EXE
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="terminal-text text-xs underline"
          >
            🔧 DEBUG_MODE
          </button>
        </div>
      </div>
    </div>
  );
}

function HackerPostComposer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading, replyingTo, onCancelReply }) {
  const fileInputRef = React.useRef(null);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      onSubmit();
    }
  };

  return (
    <div className="terminal-window mb-6">
      <div className="terminal-header">
        <div className="terminal-dots">
          <div className="terminal-dot close"></div>
          <div className="terminal-dot minimize"></div>
          <div className="terminal-dot maximize"></div>
        </div>
        <span className="terminal-text">COMPOSE.EXE</span>
      </div>
      
      <div className="p-6">
        {replyingTo && (
          <div className="hacker-post mb-4" style={{ borderColor: 'var(--cyber-blue)' }}>
            <div className="flex items-center justify-between">
              <span className="terminal-text text-sm">
                REPLYING_TO: <span className="hacker-username">{replyingTo.username}</span>
              </span>
              <button
                onClick={onCancelReply}
                className="hacker-button text-xs"
                style={{ color: 'var(--error-red)', borderColor: 'var(--error-red)' }}
              >
                ABORT
              </button>
            </div>
          </div>
        )}
        
        <div className="flex items-center space-x-2 mb-4">
          <span className="hacker-hashtag">{hashtag}</span>
          <span className="terminal-text">•</span>
          <span className="terminal-text text-sm">
            {replyingTo ? 'COMPOSE_REPLY...' : "BROADCAST_MESSAGE..."}
          </span>
        </div>
        
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${replyingTo ? 'ENTER_REPLY...' : `BROADCAST_TO_#${hashtag}...`} [CTRL+ENTER TO SEND]`}
          className="hacker-input typing-cursor"
          rows="4"
          maxLength={2000}
          style={{ resize: 'none', minHeight: '120px' }}
        />
        
        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleImageClick}
              disabled={imageUploading}
              className="hacker-button flex items-center space-x-2"
            >
              {imageUploading ? (
                <div className="matrix-loading"></div>
              ) : (
                <span>🖼️</span>
              )}
              <span>UPLOAD_IMAGE.ASCII</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            <span className="terminal-text text-sm">
              {newPost.length}/2000
            </span>
            <button
              onClick={onSubmit}
              disabled={!newPost.trim()}
              className="hacker-button"
            >
              {replyingTo ? 'SEND_REPLY 💬' : 'BROADCAST 🚀'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HackerPostsList({ posts, hashtag, onReact, onReport, onReply, userReactions }) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">💻</div>
        <h3 className="terminal-title text-xl mb-2">NO_DATA_FOUND</h3>
        <p className="terminal-text">CHANNEL #{hashtag} IS EMPTY</p>
        <p className="terminal-text text-sm mt-2">INITIATE FIRST BROADCAST...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {posts.map(post => (
        <HackerPostCard
          key={post.id}
          post={post}
          onReact={onReact}
          onReport={onReport}
          onReply={onReply}
          userReactions={userReactions}
        />
      ))}
    </div>
  );
}

function HackerPostCard({ post, onReact, onReport, onReply, userReactions }) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);

  const handleReport = () => {
    setShowReportDialog(false);
    onReport(post.id);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 1000 / 60);
    
    if (diffInMinutes < 1) return 'NOW';
    if (diffInMinutes < 60) return `${diffInMinutes}M_AGO`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}H_AGO`;
    return `${Math.floor(diffInMinutes / 1440)}D_AGO`;
  };

  const visibleReplies = showAllReplies ? (post.replies || []) : (post.replies || []).slice(0, 3);
  const hasMoreReplies = (post.replies || []).length > 3;

  return (
    <div className="terminal-window">
      <div className="terminal-header">
        <div className="terminal-dots">
          <div className="terminal-dot close"></div>
          <div className="terminal-dot minimize"></div>
          <div className="terminal-dot maximize"></div>
        </div>
        <div className="flex-1 flex justify-between items-center">
          <span className="hacker-username">{post.username}</span>
          <span className="terminal-text text-sm">{formatTime(post.created_at)}</span>
          {post.report_count > 0 && (
            <span className="status-warning text-xs">
              {post.report_count}_REPORTS
            </span>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <pre className="terminal-text whitespace-pre-wrap font-mono leading-relaxed mb-4">
          {post.content}
        </pre>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => onReact(post.id, 'smack', false)}
              className={`hacker-button text-sm transition-all duration-300 ${
                userReactions[post.id] === 'smack' ? 'active' : ''
              }`}
              style={userReactions[post.id] === 'smack' ? {
                background: 'var(--neon-green)',
                color: 'var(--matrix-black)',
                boxShadow: '0 0 15px var(--neon-green)'
              } : {}}
            >
              👊 SMACK [{post.smacks || 0}]
            </button>
            
            <button
              onClick={() => onReact(post.id, 'cap', false)}
              className={`hacker-button text-sm transition-all duration-300 ${
                userReactions[post.id] === 'cap' ? 'active' : ''
              }`}
              style={userReactions[post.id] === 'cap' ? {
                background: 'var(--neon-green)',
                color: 'var(--matrix-black)',
                boxShadow: '0 0 15px var(--neon-green)'
              } : {}}
            >
              🧢 CAP [{post.caps || 0}]
            </button>
            
            <button
              onClick={() => onReply(post)}
              className="hacker-button text-sm"
            >
              💬 REPLY [{post.replies?.length || 0}]
            </button>
          </div>
          
          <button
            onClick={() => setShowReportDialog(true)}
            className="hacker-button text-sm"
            style={{ borderColor: 'var(--error-red)', color: 'var(--error-red)' }}
          >
            🚨 REPORT
          </button>
        </div>

        {/* Comments Section */}
        {post.replies && post.replies.length > 0 && (
          <div className="space-y-3 border-l-2 pl-4 ml-4" style={{ borderColor: 'var(--dark-green)' }}>
            {visibleReplies.map(reply => (
              <div key={reply.id} className="hacker-post">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="hacker-username text-sm">{reply.username}</span>
                  <span className="terminal-text text-xs">{formatTime(reply.created_at)}</span>
                </div>
                
                <pre className="terminal-text whitespace-pre-wrap text-sm font-mono leading-relaxed mb-2">
                  {reply.content}
                </pre>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => onReact(reply.id, 'smack', true)}
                    className={`hacker-button text-xs transition-all duration-300 ${
                      userReactions[reply.id] === 'smack' ? 'active' : ''
                    }`}
                    style={userReactions[reply.id] === 'smack' ? {
                      background: 'var(--neon-green)',
                      color: 'var(--matrix-black)',
                      boxShadow: '0 0 10px var(--neon-green)'
                    } : {}}
                  >
                    👊 [{reply.smacks || 0}]
                  </button>
                  
                  <button
                    onClick={() => onReact(reply.id, 'cap', true)}
                    className={`hacker-button text-xs transition-all duration-300 ${
                      userReactions[reply.id] === 'cap' ? 'active' : ''
                    }`}
                    style={userReactions[reply.id] === 'cap' ? {
                      background: 'var(--neon-green)',
                      color: 'var(--matrix-black)',
                      boxShadow: '0 0 10px var(--neon-green)'
                    } : {}}
                  >
                    🧢 [{reply.caps || 0}]
                  </button>
                  
                  <button
                    onClick={() => onReport(reply.id)}
                    className="hacker-button text-xs"
                    style={{ borderColor: 'var(--error-red)', color: 'var(--error-red)' }}
                  >
                    🚨
                  </button>
                </div>
              </div>
            ))}
            
            {hasMoreReplies && (
              <button
                onClick={() => setShowAllReplies(!showAllReplies)}
                className="terminal-text text-sm hover:text-cyan-400 transition-colors"
              >
                {showAllReplies ? 
                  '👁️ SHOW_LESS' : 
                  `👁️ LOAD_${post.replies.length - 3}_MORE`
                }
              </button>
            )}
          </div>
        )}
      </div>

      {/* Report Dialog */}
      {showReportDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0, 0, 0, 0.9)' }}>
          <div className="terminal-window max-w-md w-full mx-4">
            <div className="terminal-header">
              <span className="terminal-text" style={{ color: 'var(--error-red)' }}>
                REPORT.EXE
              </span>
            </div>
            <div className="p-6">
              <h3 className="terminal-text text-lg mb-2">CONFIRM_REPORT?</h3>
              <p className="terminal-text mb-4">
                AUTO_REMOVAL_AT: 20_COMMUNITY_REPORTS
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleReport}
                  className="hacker-button"
                  style={{ borderColor: 'var(--error-red)', color: 'var(--error-red)' }}
                >
                  CONFIRM_REPORT
                </button>
                <button
                  onClick={() => setShowReportDialog(false)}
                  className="hacker-button"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
