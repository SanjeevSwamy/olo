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
  
  // SEPARATE REPLY STATE - NO MORE TOP COMPOSER CONFUSION!
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

  // FIXED REPLY HANDLING - SEPARATE FROM MAIN POSTING!
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

  // WORKING REPORT FUNCTION!
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
    <div className="app-container">
      <Header username={username} onLogout={logout} />
      <Navigation 
        hashtags={hashtags}
        currentHashtag={currentHashtag}
        onHashtagChange={setCurrentHashtag}
        onShowSentiment={() => setShowSentimentAnalysis(true)}
      />
      
      <main className="main-content">
        {/* MAIN POST COMPOSER - ONLY WHEN NOT REPLYING */}
        {!replyingTo && (
          <PostComposer 
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
          hashtag={currentHashtag}
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

// LOGIN PAGE COMPONENT
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
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">College Social</h1>
          <p className="login-subtitle">Connect with your campus community</p>
        </div>
        
        <div className="disclaimer-card">
          <div className="disclaimer-header">
            <h3>Privacy Notice</h3>
          </div>
          <div className="disclaimer-content">
            <p>• Community monitored network</p>
            <p>• ERP credentials for verification only</p>
            <p>• No data stored on remote servers</p>
            <p>• Anonymous identity guaranteed</p>
            
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="checkbox"
              />
              <span className="checkmark"></span>
              I acknowledge and agree to these terms
            </label>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="form-input"
              required
              disabled={loading}
            >
              <option value="student">Student</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>ERP Email</label>
            <input
              type="email"
              placeholder="Enter your ERP email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              required
              disabled={loading}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={!agreed || loading}
            className="login-button"
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Authenticating...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// HEADER COMPONENT
function Header({ username, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">College Social</h1>
          <span className="app-subtitle">Campus Network</span>
        </div>
        <div className="header-right">
          <span className="user-info">
            <span className="username">{username}</span>
            <span className="status">Online</span>
          </span>
          <button onClick={onLogout} className="logout-button">
            🚪 Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}

// NAVIGATION COMPONENT
function Navigation({ hashtags, currentHashtag, onHashtagChange, onShowSentiment }) {
  return (
    <nav className="navigation">
      <div className="nav-content">
        <div className="nav-tabs">
          {hashtags.map(tag => (
            <button
              key={tag}
              onClick={() => onHashtagChange(tag)}
              className={`nav-tab ${currentHashtag === tag ? 'active' : ''}`}
            >
              #{tag}
            </button>
          ))}
          <button
            onClick={onShowSentiment}
            className="nav-tab sentiment-tab"
            title="View sentiment analysis for this hashtag"
          >
            📊 Sentiment Analysis
          </button>
        </div>
      </div>
    </nav>
  );
}

// POST COMPOSER COMPONENT
function PostComposer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading }) {
  const fileInputRef = React.useRef(null);
  
  return (
    <div className="post-composer">
      <div className="composer-body">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder={`What's happening in #${hashtag}?`}
          className="post-textarea"
          rows={4}
        />
        
        <div className="composer-footer">
          <div className="composer-tools">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="tool-btn"
              title="Upload image"
            >
              📸 {imageUploading ? 'Converting...' : 'Image'}
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => onImageUpload(e.target.files[0])}
              className="hidden"
            />
          </div>
          
          <div className="composer-actions">
            <span className="char-count">
              {newPost.length} characters
            </span>
            <button 
              onClick={onSubmit}
              disabled={!newPost.trim() || imageUploading}
              className="submit-btn"
            >
              📝 Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// INLINE REPLY COMPOSER COMPONENT
function InlineReplyComposer({ replyText, setReplyText, onSubmit, onCancel, replyingTo }) {
  return (
    <div className="inline-reply-composer">
      <div className="reply-indicator">
        <span className="reply-text">
          ↩️ Replying to @{replyingTo.username}
        </span>
        <button onClick={onCancel} className="cancel-reply-btn">
          ✕
        </button>
      </div>
      
      <div className="reply-body">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={`Reply to @${replyingTo.username}...`}
          className="reply-textarea"
          rows={3}
        />
        
        <div className="reply-actions">
          <button 
            onClick={onSubmit}
            disabled={!replyText.trim()}
            className="reply-submit-btn"
          >
            ↩️ Reply
          </button>
          <button onClick={onCancel} className="reply-cancel-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// POST CONTENT RENDERER COMPONENT
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

// POSTS LIST COMPONENT
function PostsList({ 
  posts, 
  hashtag, 
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
        <div className="empty-icon">🌟</div>
        <h3>No posts yet</h3>
        <p>Be the first to post in #{hashtag}</p>
      </div>
    );
  }
  
  return (
    <div className="posts-list">
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

// POST CARD COMPONENT WITH WORKING REPORT AND INLINE REPLIES
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
    <div className="post-card">
      {/* MAIN POST */}
      <div className="post-block">
        <div className="post-header">
          <div className="post-user-info">
            <div className="user-avatar">
              {post.username.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-details">
              <span className="post-username">{post.username}</span>
              <span className="post-time">{formatTime(post.created_at)}</span>
            </div>
          </div>
          {/* WORKING REPORT BUTTON */}
          <button 
            onClick={() => onReport(post.id)}
            className="action-btn report-btn"
            title="Report this post"
          >
            🚩 Report{post.report_count >= 10 && ` (${post.report_count})`}
          </button>
        </div>
        
        <PostContent content={post.content} />
        
        {/* ACTION BUTTONS WITH EMOJIS */}
        <div className="post-actions">
          <button
            onClick={() => onReact(post.id, 'smack', false)}
            className={`action-btn like-btn ${userReactions[post.id] === 'smack' ? 'active' : ''}`}
          >
            👍 {post.smacks || 0}
          </button>
          
          <button
            onClick={() => onReact(post.id, 'cap', false)}
            className={`action-btn dislike-btn ${userReactions[post.id] === 'cap' ? 'active' : ''}`}
          >
            👎 {post.caps || 0}
          </button>
          
          <button
            onClick={() => onReply(post)}
            className="action-btn reply-btn"
          >
            ↩️ Reply
          </button>
        </div>
      </div>

      {/* INLINE REPLY COMPOSER FOR THIS POST */}
      {replyingTo && replyingTo.id === post.id && (
        <InlineReplyComposer
          replyText={replyText}
          setReplyText={setReplyText}
          onSubmit={onSubmitReply}
          onCancel={onCancelReply}
          replyingTo={replyingTo}
        />
      )}

      {/* REPLIES SECTION */}
      {post.replies && post.replies.length > 0 && (
        <div className="replies-section">
          {visibleReplies.map(reply => (
            <div key={reply.id} className="reply-block">
              <div className="reply-header">
                <div className="user-avatar small">
                  {reply.username.substring(0, 2).toUpperCase()}
                </div>
                <span className="reply-username">{reply.username}</span>
                <span className="reply-time">{formatTime(reply.created_at)}</span>
                
                {/* WORKING REPORT BUTTON FOR REPLY */}
                <button 
                  onClick={() => onReport(reply.id)}
                  className="action-btn report-btn small"
                  title="Report this reply"
                >
                  🚩{reply.report_count >= 10 && ` (${reply.report_count})`}
                </button>
              </div>
              
              <PostContent content={reply.content} />
              
              {/* REPLY ACTIONS WITH EMOJIS */}
              <div className="reply-actions">
                <button
                  onClick={() => onReact(reply.id, 'smack', true)}
                  className={`action-btn like-btn small ${userReactions[reply.id] === 'smack' ? 'active' : ''}`}
                >
                  👍 {reply.smacks || 0}
                </button>
                
                <button
                  onClick={() => onReact(reply.id, 'cap', true)}
                  className={`action-btn dislike-btn small ${userReactions[reply.id] === 'cap' ? 'active' : ''}`}
                >
                  👎 {reply.caps || 0}
                </button>
                
                <button
                  onClick={() => onReply(reply)}
                  className="action-btn reply-btn small"
                >
                  ↩️ Reply
                </button>
              </div>

              {/* INLINE REPLY COMPOSER FOR THIS REPLY */}
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
              className="show-more-btn"
            >
              {showAllReplies ? '🔼 Show less' : `🔽 Show ${post.replies.length - 3} more replies`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// SENTIMENT ANALYSIS COMPONENT (keep your existing one)
function SentimentAnalysis({ hashtag, onClose }) {
  // Your existing sentiment analysis component code here
  return (
    <div className="sentiment-overlay">
      <div className="sentiment-modal">
        <div className="sentiment-header">
          <h2>📊 Sentiment Analysis - #{hashtag}</h2>
          <button onClick={onClose} className="close-button">✕</button>
        </div>
        <div className="sentiment-content">
          <p>Sentiment analysis will be displayed here...</p>
        </div>
      </div>
    </div>
  );
}

export default App;
