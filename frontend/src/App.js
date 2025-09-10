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
  
  // Reply handling
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  
  const [userReactions, setUserReactions] = useState({});
  const [showSentimentAnalysis, setShowSentimentAnalysis] = useState(false);
  
  const fileInputRef = React.useRef(null);
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
          report_count: post.report_count || 0,
          replies: (post.replies || []).map(reply => ({
            ...reply,
            smacks: reply.smacks || 0,
            caps: reply.caps || 0,
            report_count: reply.report_count || 0
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
      } else {
        throw new Error(data.detail || 'Login failed');
      }
    } catch (error) {
      alert(`Login failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // CREATE POST FUNCTION
  const createPost = async () => {
    if (!newPost.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: newPost.trim(),
          hashtag: currentHashtag
        })
      });
      
      if (response.ok) {
        setNewPost('');
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to create post');
      }
    } catch (error) {
      alert('Failed to create post');
    }
  };

  // Reply handling
  const handleReply = (item) => {
    setReplyingTo(item);
    setReplyText(`@${item.username} `);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
    setReplyText('');
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !replyingTo) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: replyText.trim(),
          hashtag: currentHashtag,
          parent_id: replyingTo.id
        })
      });
      
      if (response.ok) {
        setReplyText('');
        setReplyingTo(null);
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to create reply');
      }
    } catch (error) {
      alert('Failed to create reply');
    }
  };

  const reactToPost = async (postId, reactionType, isReply = false) => {
    if (loadingReactions[postId]) return;
    setLoadingReactions(prev => ({ ...prev, [postId]: true }));
    
    const currentReaction = userReactions[postId];
    const newReactionState = currentReaction === reactionType ? null : reactionType;
    
    setUserReactions(prev => ({ ...prev, [postId]: newReactionState }));
    
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
      console.error('Reaction failed:', error);
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
    if (!window.confirm('Are you sure you want to report this post?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts/${postId}/report`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        if (data.removed) {
          fetchPosts();
        }
      } else {
        throw new Error(data.detail || 'Failed to report');
      }
    } catch (error) {
      alert(`Report failed: ${error.message}`);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setImageUploading(true);
    
    try {
      const resizedFile = await resizeImage(file, 200, 200, 0.7);
      const formData = new FormData();
      formData.append('file', resizedFile, 'resized-image.jpg');
      
      const response = await fetch(`${API_BASE}/upload-minecraft-visual`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setNewPost(prev => {
          const cleanContent = prev.trim();
          return cleanContent + '\n\n[VISUAL_BLOCKS]' + data.minecraft_html + '[/VISUAL_BLOCKS]';
        });
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        alert('Image conversion failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const resizeImage = (file, maxWidth = 300, maxHeight = 300, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUsername('');
    setPosts([]);
    setNewPost('');
    setReplyingTo(null);
    setReplyText('');
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} loading={loading} />;
  }

  // LIMIT TO TOP 3 POSTS ONLY
  const displayedPosts = posts.slice(0, 3);

  return (
    <div className="app">
      <Header username={username} onLogout={logout} />
      <Navigation 
        hashtags={hashtags}
        currentHashtag={currentHashtag}
        onHashtagChange={setCurrentHashtag}
        onShowSentiment={() => setShowSentimentAnalysis(true)}
      />
      
      <main className="main">
        {/* POST COMPOSER */}
        {!replyingTo && (
          <Composer 
            newPost={newPost}
            setNewPost={setNewPost}
            onSubmit={createPost}
            onImageUpload={handleImageUpload}
            hashtag={currentHashtag}
            imageUploading={imageUploading}
          />
        )}
        
        <PostsList 
          posts={displayedPosts}
          onReact={reactToPost}
          onReply={handleReply}
          onReport={reportPost}
          userReactions={userReactions}
          replyingTo={replyingTo}
          replyText={replyText}
          setReplyText={setReplyText}
          onSubmitReply={handleSubmitReply}
          onCancelReply={handleCancelReply}
        />
      </main>

      {showSentimentAnalysis && (
        <SentimentAnalysis 
          hashtag={currentHashtag}
          onClose={() => setShowSentimentAnalysis(false)}
        />
      )}
    </div>
  );
}

// LOGIN PAGE
function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [agreed, setAgreed] = useState(false);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (agreed && !loading) {
      onLogin(email, password, role, agreed);
    }
  };
  
  return (
    <div className="login">
      <div className="login-card">
        <h1>College Social</h1>
        <p>Connect with your campus community</p>
        
        <div className="disclaimer">
          <h3>Privacy Notice</h3>
          <p>• Community monitored network</p>
          <p>• ERP credentials for verification only</p>
          <p>• No data stored on remote servers</p>
          <p>• Anonymous identity guaranteed</p>
          
          <label className="checkbox">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            I acknowledge and agree to these terms
          </label>
        </div>
        
        <form onSubmit={handleSubmit}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            disabled={loading}
          >
            <option value="student">Student</option>
            <option value="staff">Staff</option>
          </select>
          
          <input
            type="email"
            placeholder="Enter your ERP email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          
          <button 
            type="submit" 
            disabled={!agreed || loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// HEADER
function Header({ username, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <h1>College Social</h1>
        <div className="user-section">
          <span>{username}</span>
          <button onClick={onLogout}>Sign Out</button>
        </div>
      </div>
    </header>
  );
}

// NAVIGATION
function Navigation({ hashtags, currentHashtag, onHashtagChange, onShowSentiment }) {
  return (
    <nav className="nav">
      <div className="nav-tabs">
        {hashtags.map(tag => (
          <button
            key={tag}
            onClick={() => onHashtagChange(tag)}
            className={currentHashtag === tag ? 'active' : ''}
          >
            #{tag}
          </button>
        ))}
        <button onClick={onShowSentiment}>
          Sentiment Analysis
        </button>
      </div>
    </nav>
  );
}

// POST COMPOSER
function Composer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading }) {
  const fileInputRef = React.useRef(null);
  
  return (
    <div className="composer">
      <textarea
        value={newPost}
        onChange={(e) => setNewPost(e.target.value)}
        placeholder={`What's happening in #${hashtag}?`}
        rows={4}
      />
      
      <div className="composer-actions">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={imageUploading}
        >
          {imageUploading ? 'Converting...' : 'Add Image'}
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onImageUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />
        
        <div className="spacer"></div>
        
        <span className="char-count">{newPost.length} characters</span>
        
        <button 
          onClick={onSubmit}
          disabled={!newPost.trim() || imageUploading}
          className="primary"
        >
          Post
        </button>
      </div>
    </div>
  );
}

// INLINE REPLY COMPOSER
function InlineReplyComposer({ replyText, setReplyText, onSubmit, onCancel, replyingTo }) {
  return (
    <div className="inline-reply">
      <div className="reply-header">
        <span>Replying to @{replyingTo.username}</span>
        <button onClick={onCancel}>Cancel</button>
      </div>
      
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder={`Reply to @${replyingTo.username}...`}
        rows={3}
      />
      
      <div className="reply-actions">
        <button 
          onClick={onSubmit}
          disabled={!replyText.trim()}
          className="primary"
        >
          Reply
        </button>
      </div>
    </div>
  );
}

// POST CONTENT RENDERER
function PostContent({ content }) {
  const parts = content.split(/\[VISUAL_BLOCKS\](.*?)\[\/VISUAL_BLOCKS\]/gs);
  
  return (
    <div className="post-content">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <div 
              key={index}
              dangerouslySetInnerHTML={{ __html: part }}
              className="minecraft-render"
            />
          );
        } else {
          return (
            <div key={index} className="text-content">
              {part.split('\n').map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                  {line}
                  {lineIndex < part.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          );
        }
      })}
    </div>
  );
}

// POSTS LIST
function PostsList({ 
  posts, 
  onReact, 
  onReply, 
  onReport, 
  userReactions, 
  replyingTo, 
  replyText, 
  setReplyText, 
  onSubmitReply, 
  onCancelReply 
}) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <h3>No posts yet</h3>
        <p>Be the first to post!</p>
      </div>
    );
  }
  
  return (
    <div className="posts">
      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          onReact={onReact}
          onReply={onReply}
          onReport={onReport}
          userReactions={userReactions}
          replyingTo={replyingTo}
          replyText={replyText}
          setReplyText={setReplyText}
          onSubmitReply={onSubmitReply}
          onCancelReply={onCancelReply}
        />
      ))}
    </div>
  );
}

// POST CARD
function PostCard({ 
  post, 
  onReact, 
  onReply, 
  onReport, 
  userReactions, 
  replyingTo, 
  replyText, 
  setReplyText, 
  onSubmitReply, 
  onCancelReply 
}) {
  const [showAllReplies, setShowAllReplies] = useState(false);
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 1000 / 60);
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  const visibleReplies = showAllReplies ? (post.replies || []) : (post.replies || []).slice(0, 3);
  const hasMoreReplies = (post.replies || []).length > 3;

  return (
    <article className="post">
      <div className="post-header">
        <div className="user-info">
          <div className="avatar">
            {post.username.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="username">{post.username}</span>
            <span className="time">{formatTime(post.created_at)}</span>
          </div>
        </div>
        
        <button onClick={() => onReport(post.id)} className="report">
          Report
        </button>
      </div>
      
      <PostContent content={post.content} />
      
      <div className="post-actions">
        <button
          onClick={() => onReact(post.id, 'smack', false)}
          className={userReactions[post.id] === 'smack' ? 'active' : ''}
        >
          Like {post.smacks || 0}
        </button>
        
        <button
          onClick={() => onReact(post.id, 'cap', false)}
          className={userReactions[post.id] === 'cap' ? 'active' : ''}
        >
          Dislike {post.caps || 0}
        </button>
        
        <button onClick={() => onReply(post)}>
          Reply
        </button>
      </div>

      {/* INLINE REPLY FOR THIS POST */}
      {replyingTo && replyingTo.id === post.id && (
        <InlineReplyComposer
          replyText={replyText}
          setReplyText={setReplyText}
          onSubmit={onSubmitReply}
          onCancel={onCancelReply}
          replyingTo={replyingTo}
        />
      )}

      {/* REPLIES */}
      {post.replies && post.replies.length > 0 && (
        <div className="replies">
          {visibleReplies.map(reply => (
            <div key={reply.id} className="reply">
              <div className="reply-header">
                <div className="avatar small">
                  {reply.username.substring(0, 2).toUpperCase()}
                </div>
                <span className="username">{reply.username}</span>
                <span className="time">{formatTime(reply.created_at)}</span>
                
                <button onClick={() => onReport(reply.id)} className="report">
                  Report
                </button>
              </div>
              
              <PostContent content={reply.content} />
              
              <div className="reply-actions">
                <button
                  onClick={() => onReact(reply.id, 'smack', true)}
                  className={userReactions[reply.id] === 'smack' ? 'active' : ''}
                >
                  Like {reply.smacks || 0}
                </button>
                
                <button
                  onClick={() => onReact(reply.id, 'cap', true)}
                  className={userReactions[reply.id] === 'cap' ? 'active' : ''}
                >
                  Dislike {reply.caps || 0}
                </button>
                
                <button onClick={() => onReply(reply)}>
                  Reply
                </button>
              </div>

              {/* INLINE REPLY FOR THIS REPLY */}
              {replyingTo && replyingTo.id === reply.id && (
                <InlineReplyComposer
                  replyText={replyText}
                  setReplyText={setReplyText}
                  onSubmit={onSubmitReply}
                  onCancel={onCancelReply}
                  replyingTo={replyingTo}
                />
              )}
            </div>
          ))}
          
          {hasMoreReplies && (
            <button
              onClick={() => setShowAllReplies(!showAllReplies)}
              className="show-more"
            >
              {showAllReplies ? 'Show less' : `Show ${post.replies.length - 3} more replies`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// SENTIMENT ANALYSIS
function SentimentAnalysis({ hashtag, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Sentiment Analysis - #{hashtag}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal-content">
          <p>Sentiment analysis will be displayed here...</p>
        </div>
      </div>
    </div>
  );
}

export default App;
