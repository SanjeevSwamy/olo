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
          report_count: post.report_count || 0, // ADD REPORT COUNT
          replies: (post.replies || []).map(reply => ({
            ...reply,
            smacks: reply.smacks || 0,
            caps: reply.caps || 0,
            report_count: reply.report_count || 0 // ADD REPORT COUNT FOR REPLIES
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

  // Image resize function
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

  // NEW REPORT FUNCTION
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
          // Post was auto-removed due to reports
          fetchPosts(); // Refresh to show updated posts
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
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} loading={loading} />;
  }

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
        <PostComposer 
          newPost={newPost}
          setNewPost={setNewPost}
          onSubmit={createPost}
          onImageUpload={handleImageUpload}
          hashtag={currentHashtag}
          imageUploading={imageUploading}
          replyingTo={replyingTo}
          onCancelReply={() => {
            setReplyingTo(null);
            setNewPost('');
          }}
        />
        
        <PostsList 
          posts={posts} 
          hashtag={currentHashtag}
          onReact={reactToPost}
          onReply={(post) => {
            setReplyingTo(post);
            setNewPost(`@${post.username} `);
          }}
          onReport={reportPost} // ADD REPORT PROP
          userReactions={userReactions}
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

// Clean Login Component
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

// Clean Header
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
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}

// Navigation Component
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

// UPDATED PostComposer - REMOVED maxLength (NO CHARACTER LIMIT!)
function PostComposer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading, replyingTo, onCancelReply }) {
  const fileInputRef = React.useRef(null);
  
  return (
    <div className="post-composer">
      {replyingTo && (
        <div className="reply-indicator">
          <span className="reply-text">Replying to @{replyingTo.username}</span>
          <button onClick={onCancelReply} className="cancel-reply">×</button>
        </div>
      )}
      
      <div className="composer-body">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder={`What's happening in #${hashtag}?`}
          className="post-textarea"
          // REMOVED maxLength={2000} - NO CHARACTER LIMIT!
          rows={3}
        />
        
        <div className="composer-footer">
          <div className="composer-tools">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="image-upload-btn"
              title="Upload image"
            >
              {imageUploading ? 'Converting...' : 'Add Image'}
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
              className="post-submit-btn"
            >
              {replyingTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sentiment Analysis Component
function SentimentAnalysis({ hashtag, onClose }) {
  const [sentimentData, setSentimentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSentimentData();
  }, [hashtag]);

  const fetchSentimentData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/sentiment-analysis/${hashtag}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSentimentData(data);
      } else if (response.status === 401) {
        alert('Session expired. Please login again.');
        window.location.reload();
      } else {
        throw new Error('Failed to fetch sentiment data');
      }
    } catch (error) {
      console.error('Error fetching sentiment data:', error);
      setError('Failed to load sentiment analysis');
    } finally {
      setLoading(false);
    }
  };

  const getEmotionIcon = (emotion) => {
    // Handle compound emotions like "positive (2), curious (1)"
    if (emotion && emotion.includes(',')) {
      return '🤔'; // Mixed emotions icon
    }
    
    switch (emotion) {
      case 'positive': case 'joy': return '😊';
      case 'negative': case 'sadness': case 'anger': case 'fear': return '😞';
      case 'neutral': case 'curiosity': case 'admiration': return '😐';
      case 'curious': case 'uncertain': return '🤔';
      case 'no_replies': return '💭';
      case 'unknown': case null: return '❓';
      default: return '🤔';
    }
  };

  const getEmotionColor = (emotion) => {
    // Handle compound emotions
    if (emotion && emotion.includes(',')) {
      return '#722ed1'; // Purple for mixed emotions
    }
    
    switch (emotion) {
      case 'positive': case 'joy': return '#52c41a';
      case 'negative': case 'sadness': case 'anger': case 'fear': return '#ff4d4f';
      case 'neutral': case 'curiosity': case 'admiration': return '#faad14';
      case 'curious': case 'uncertain': return '#722ed1';
      case 'no_replies': return '#8c8c8c';
      case 'unknown': case null: return '#d9d9d9';
      default: return '#722ed1';
    }
  };

  const getEmotionLabel = (emotion) => {
    // Handle compound emotions like "positive (2), curious (1)"
    if (emotion && emotion.includes(',')) {
      return emotion; // Display as-is for compound emotions
    }
    
    switch (emotion) {
      case 'positive': case 'joy': return 'Positive';
      case 'negative': return 'Negative';
      case 'sadness': return 'Sad';
      case 'anger': return 'Angry';
      case 'fear': return 'Fearful';
      case 'neutral': return 'Neutral';
      case 'curious': case 'curiosity': return 'Curious';
      case 'uncertain': return 'Uncertain';
      case 'admiration': return 'Admiring';
      case 'no_replies': return 'No Replies';
      case 'unknown': case null: return 'Unknown';
      default: return emotion || 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="sentiment-overlay">
        <div className="sentiment-modal">
          <div className="sentiment-header">
            <h2>Sentiment Analysis - #{hashtag}</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="loading">
            <div className="loading-spinner"></div>
            Analyzing post emotions...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sentiment-overlay">
        <div className="sentiment-modal">
          <div className="sentiment-header">
            <h2>Sentiment Analysis - #{hashtag}</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sentiment-overlay">
      <div className="sentiment-modal">
        <div className="sentiment-header">
          <h2>Sentiment Analysis - #{hashtag}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {/* Summary Statistics */}
        <div className="sentiment-summary">
          <div className="summary-card">
            <h3>Post Emotions Overview</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-value">{sentimentData.summary.total}</span>
                <span className="stat-label">Total Posts</span>
              </div>
              <div className="stat-item positive">
                <span className="stat-value">{sentimentData.summary.positive}</span>
                <span className="stat-label">😊 Positive</span>
              </div>
              <div className="stat-item negative">
                <span className="stat-value">{sentimentData.summary.negative}</span>
                <span className="stat-label">😞 Negative</span>
              </div>
              <div className="stat-item neutral">
                <span className="stat-value">{sentimentData.summary.neutral}</span>
                <span className="stat-label">😐 Neutral</span>
              </div>
              <div className="stat-item unknown">
                <span className="stat-value">{sentimentData.summary.unknown}</span>
                <span className="stat-label">❓ Unknown</span>
              </div>
            </div>
          </div>
        </div>

        {/* Posts List */}
        <div className="sentiment-posts">
          {sentimentData.posts.map((post, index) => (
            <div key={post.post_id} className="sentiment-post-card">
              <div className="post-header">
                <div className="post-info">
                  <span className="post-author">{post.username}</span>
                  <span className="post-time">{new Date(post.created_at).toLocaleString()}</span>
                </div>
                <div className="emotion-badge" style={{ backgroundColor: getEmotionColor(post.post_emotion) }}>
                  {getEmotionIcon(post.post_emotion)} {getEmotionLabel(post.post_emotion)}
                </div>
              </div>
              
              <div className="post-content-preview">
                {post.content}
              </div>
              
              {post.replies_count > 0 && (
                <div className="replies-sentiment">
                  <div className="replies-header">
                    <span className="replies-count">{post.replies_count} replies</span>
                    <div className="replies-sentiment-badge" style={{ backgroundColor: getEmotionColor(post.overall_reply_emotion) }}>
                      {getEmotionIcon(post.overall_reply_emotion)} Average: {getEmotionLabel(post.overall_reply_emotion)}
                    </div>
                  </div>
                  
                  <div className="reply-breakdown">
                    {post.reply_breakdown.positive > 0 && (
                      <span className="breakdown-item positive">😊 {post.reply_breakdown.positive}</span>
                    )}
                    {post.reply_breakdown.negative > 0 && (
                      <span className="breakdown-item negative">😞 {post.reply_breakdown.negative}</span>
                    )}
                    {post.reply_breakdown.neutral > 0 && (
                      <span className="breakdown-item neutral">😐 {post.reply_breakdown.neutral}</span>
                    )}
                    {post.reply_breakdown.unknown > 0 && (
                      <span className="breakdown-item unknown">❓ {post.reply_breakdown.unknown}</span>
                    )}
                  </div>
                  
                  {post.reply_details.length > 0 && (
                    <details className="reply-details">
                      <summary>View individual reply emotions</summary>
                      <div className="reply-list">
                        {post.reply_details.map((reply, idx) => (
                          <div key={idx} className="reply-item">
                            <span className="reply-sentiment" style={{ color: getEmotionColor(reply.emotion) }}>
                              {getEmotionIcon(reply.emotion)}
                            </span>
                            <span className="reply-content">{reply.content}</span>
                            <span className="reply-author">- {reply.username}</span>
                            <span className="reply-emotion-label">({getEmotionLabel(reply.emotion)})</span>
                          </div>
                        ))}
                        {post.replies_count > post.reply_details.length && (
                          <div className="more-replies">
                            +{post.replies_count - post.reply_details.length} more replies
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// UPDATED PostsList - ADD onReport prop
function PostsList({ posts, hashtag, onReact, onReply, onReport, userReactions }) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
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
          onReport={onReport} // ADD REPORT PROP
          userReactions={userReactions}
        />
      ))}
    </div>
  );
}

// COMPLETELY UPDATED PostCard - REPLY BUTTONS INSIDE EACH POST/REPLY + REPORT FEATURE
function PostCard({ post, onReact, onReply, onReport, userReactions }) {
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
      {/* MAIN POST BLOCK */}
      <div className="main-post-block">
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
          {/* REPORT BUTTON FOR MAIN POST */}
          <button 
            onClick={() => onReport(post.id)}
            className="report-button"
            title="Report this post"
          >
            Report
            {post.report_count >= 10 && ` (${post.report_count})`}
          </button>
        </div>
        
        <PostContent content={post.content} />
        
        {/* POST ACTIONS - REPLY BUTTON INSIDE POST */}
        <div className="post-actions">
          <div className="reaction-buttons">
            <button
              onClick={() => onReact(post.id, 'smack', false)}
              className={`reaction-button ${userReactions[post.id] === 'smack' ? 'active' : ''}`}
            >
              Like {post.smacks || 0}
            </button>
            
            <button
              onClick={() => onReact(post.id, 'cap', false)}
              className={`reaction-button ${userReactions[post.id] === 'cap' ? 'active' : ''}`}
            >
              Dislike {post.caps || 0}
            </button>
            
            {/* REPLY BUTTON MOVED HERE! */}
            <button
              onClick={() => onReply(post)}
              className="action-button"
            >
              Reply {post.replies?.length || 0}
            </button>
          </div>
        </div>
      </div>

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
                
                {/* REPORT BUTTON FOR EACH REPLY */}
                <button 
                  onClick={() => onReport(reply.id)}
                  className="report-button small"
                  title="Report this reply"
                >
                  Report
                  {reply.report_count >= 10 && ` (${reply.report_count})`}
                </button>
              </div>
              
              <PostContent content={reply.content} />
              
              {/* REPLY ACTIONS - REPLY BUTTON INSIDE EACH REPLY */}
              <div className="reply-actions">
                <button
                  onClick={() => onReact(reply.id, 'smack', true)}
                  className={`reaction-button small ${userReactions[reply.id] === 'smack' ? 'active' : ''}`}
                >
                  Like {reply.smacks || 0}
                </button>
                
                <button
                  onClick={() => onReact(reply.id, 'cap', true)}
                  className={`reaction-button small ${userReactions[reply.id] === 'cap' ? 'active' : ''}`}
                >
                  Dislike {reply.caps || 0}
                </button>
                
                {/* REPLY BUTTON FOR REPLYING TO THIS REPLY */}
                <button
                  onClick={() => onReply(reply)}
                  className="action-button small"
                >
                  Reply
                </button>
              </div>
            </div>
          ))}
          
          {hasMoreReplies && (
            <button
              onClick={() => setShowAllReplies(!showAllReplies)}
              className="show-more-button"
            >
              {showAllReplies ? 
                'Show less' : 
                `Show ${post.replies.length - 3} more replies`
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Clean Post Content Renderer
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

export default App;
