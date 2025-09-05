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
          alert(`Welcome ${data.username}! You're now connected to the network.`);
        }, 500);
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

 @app.post("/posts/{post_id}/report")
async def report_post(post_id: str, authorization: Optional[str] = Header(None)):
    """Report a post"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization token required")
    
    token = authorization.replace("Bearer ", "")
    logger.info(f"🔍 Report request - Token: {token[:50]}...")  # Log token
    
    user = get_current_user(token)
    logger.info(f"🔍 Report request - User: {user}")  # Log user info
    
    try:
        # Insert report with detailed logging
        logger.info(f"🔍 Attempting to insert report for post {post_id} by user {user['user_id']}")
        
        supabase.table("reports").insert({
            "post_id": post_id,
            "reporter_user_id": user["user_id"]
        }).execute()
        
        logger.info(f"✅ Report inserted successfully!")
        
        # Check report count
        reports = supabase.table("reports").select("id").eq("post_id", post_id).execute()
        report_count = len(reports.data)
        
        # Auto-remove if threshold reached
        if report_count >= REPORT_THRESHOLD:
            supabase.table("posts").update({"is_removed": True}).eq("id", post_id).execute()
            logger.info(f"🚨 Post auto-removed: {report_count} reports")
            
            return {
                "success": True,
                "report_count": report_count,
                "threshold": REPORT_THRESHOLD,
                "message": "Post removed due to community reports",
                "removed": True
            }
        
        return {
            "success": True,
            "report_count": report_count,
            "threshold": REPORT_THRESHOLD,
            "message": f"{report_count}/{REPORT_THRESHOLD} reports needed to remove"
        }
        
    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(400, "You already reported this post")
        logger.error(f"💥 Detailed error reporting post {post_id}: {e}")
        logger.error(f"💥 Error type: {type(e)}")
        logger.error(f"💥 User attempting report: {user}")
        raise HTTPException(500, "Failed to report post")


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
    
    // ✅ Changed endpoint to visual minecraft
    const response = await fetch(`${API_BASE}/upload-minecraft-visual`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      // ✅ Insert visual blocks with special markers
      setNewPost(prev => prev + '\n\n🎮 MINECRAFT BLOCKS:\n[VISUAL_BLOCKS]' + data.minecraft_html + '[/VISUAL_BLOCKS]');
    } else {
      alert('Minecraft conversion failed');
    }
  } catch (error) {
    alert('Minecraft upload failed');
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
    return <LoginPage onLogin={handleLogin} onClearCache={clearCache} loading={loading} />;
  }

  return (
    <div className="app-container">
      <Header username={username} onLogout={logout} />
      <Navigation 
        hashtags={hashtags}
        currentHashtag={currentHashtag}
        onHashtagChange={setCurrentHashtag}
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
          onCancelReply={cancelReply}
        />
        
        <PostsList 
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

function LoginPage({ onLogin, onClearCache, loading }) {
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
      alert('Please enter email first');
      return;
    }
    onClearCache(email);
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
            <span className="warning-icon">⚠️</span>
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
              <>
                <span>🔐</span>
                Login
              </>
            )}
          </button>
        </form>

        {showDebug && (
          <div className="debug-panel">
            <button onClick={handleClearCache} className="debug-button">
              Clear Cache
            </button>
          </div>
        )}
        
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="debug-toggle"
        >
          Debug Mode
        </button>
      </div>
    </div>
  );
}

function Header({ username, onLogout }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">🎓 College Social</h1>
          <span className="app-subtitle">Campus Network</span>
        </div>
        <div className="header-right">
          <span className="user-info">
            <span className="username">{username}</span>
            <span className="status">● Online</span>
          </span>
          <button onClick={onLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

function Navigation({ hashtags, currentHashtag, onHashtagChange }) {
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
        </div>
      </div>
    </nav>
  );
}

function PostComposer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading, replyingTo, onCancelReply }) {
  const fileInputRef = React.useRef(null);
  
  return (
    <div className="post-composer">
      <div className="composer-header">
        <h3>🎮 Minecraft Block Converter</h3>
        {replyingTo && (
          <div className="reply-indicator">
            Replying to @{replyingTo.username}
            <button onClick={onCancelReply} className="cancel-reply">×</button>
          </div>
        )}
      </div>
      
      <textarea
        value={newPost}
        onChange={(e) => setNewPost(e.target.value)}
        placeholder={`Share something in #${hashtag}...`}
        className="post-textarea"
        maxLength={2000}
      />
      
      <div className="composer-actions">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={imageUploading}
          className="minecraft-button"
        >
          {imageUploading ? (
            <>
              <div className="spinner"></div>
              Converting...
            </>
          ) : (
            <>
              <span>🎮</span>
              MINECRAFT_BLOCKS
            </>
          )}
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onImageUpload(e.target.files[0])}
          className="hidden"
        />
        
        <button 
          onClick={onSubmit}
          disabled={!newPost.trim()}
          className="submit-button"
        >
          Post
        </button>
      </div>
      
      <div className="character-count">
        {newPost.length}/2000
      </div>
    </div>
  );
}
function MinecraftBlockRenderer({ htmlContent }) {
  return (
    <div 
      dangerouslySetInnerHTML={{ __html: htmlContent }}
      className="minecraft-render"
    />
  );
}

function PostContent({ content }) {
  // Split content to find visual blocks
  const parts = content.split(/\[VISUAL_BLOCKS\](.*?)\[\/VISUAL_BLOCKS\]/gs);
  
  return (
    <div className="post-content">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          // This is Minecraft HTML content
          return <MinecraftBlockRenderer key={index} htmlContent={part} />;
        } else {
          // Regular text content
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


function PostsList({ posts, hashtag, onReact, onReport, onReply, userReactions }) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💻</div>
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
          onReport={onReport}
          onReply={onReply}
          userReactions={userReactions}
        />
      ))}
    </div>
  );
}

function PostCard({ post, onReact, onReport, onReply, userReactions }) {
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
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };
  
  const visibleReplies = showAllReplies ? (post.replies || []) : (post.replies || []).slice(0, 3);
  const hasMoreReplies = (post.replies || []).length > 3;
  
  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-user">
          <span className="post-username">{post.username}</span>
          <span className="post-time">{formatTime(post.created_at)}</span>
        </div>
        {post.report_count > 0 && (
          <span className="report-count">
            {post.report_count} reports
          </span>
        )}
      </div>
      
      {/* ✅ Use PostContent component for visual blocks */}
      <PostContent content={post.content} />
      
      <div className="post-actions">
        <div className="reaction-buttons">
          <button
            onClick={() => onReact(post.id, 'smack', false)}
            className={`reaction-button ${userReactions[post.id] === 'smack' ? 'active' : ''}`}
          >
            👊 {post.smacks || 0}
          </button>
          
          <button
            onClick={() => onReact(post.id, 'cap', false)}
            className={`reaction-button ${userReactions[post.id] === 'cap' ? 'active' : ''}`}
          >
            🧢 {post.caps || 0}
          </button>
          
          <button
            onClick={() => onReply(post)}
            className="action-button"
          >
            💬 {post.replies?.length || 0}
          </button>
        </div>
        
        <button
          onClick={() => setShowReportDialog(true)}
          className="report-button"
        >
          Report
        </button>
      </div>

      {/* Rest of your existing reply logic stays the same */}
      {post.replies && post.replies.length > 0 && (
        <div className="replies-section">
          {visibleReplies.map(reply => (
            <div key={reply.id} className="reply-card">
              <div className="reply-header">
                <span className="reply-username">{reply.username}</span>
                <span className="reply-time">{formatTime(reply.created_at)}</span>
              </div>
              
              {/* ✅ Use PostContent for replies too */}
              <PostContent content={reply.content} />
              
              <div className="reply-actions">
                <button
                  onClick={() => onReact(reply.id, 'smack', true)}
                  className={`reaction-button small ${userReactions[reply.id] === 'smack' ? 'active' : ''}`}
                >
                  👊 {reply.smacks || 0}
                </button>
                
                <button
                  onClick={() => onReact(reply.id, 'cap', true)}
                  className={`reaction-button small ${userReactions[reply.id] === 'cap' ? 'active' : ''}`}
                >
                  🧢 {reply.caps || 0}
                </button>
                
                <button
                  onClick={() => onReport(reply.id)}
                  className="report-button small"
                >
                  Report
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

      {/* Existing report dialog */}
      {showReportDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Report Post</h3>
            </div>
            <div className="modal-content">
              <p>Are you sure you want to report this post?</p>
              <p className="modal-note">Posts are automatically removed after 20 reports.</p>
            </div>
            <div className="modal-actions">
              <button onClick={handleReport} className="confirm-button">
                Report
              </button>
              <button onClick={() => setShowReportDialog(false)} className="cancel-button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
